import { useCallback, useEffect, useState } from "react";
import {
  AztecAddress,
  Fr,
  accountFeeOptions,
  asFieldBigInt,
  authorFeeSponsorAddress,
  hiddenAuthorFeeOptions,
  pollIdFromRaw,
  readHiddenAuthorSlots,
  registerHappyVote,
  registerHiddenAuthorBook,
  registerStandardContracts,
} from "../lib/aztecClient.js";
import {
  catalogDraftContentHash,
  clearCatalogDraft,
  readCatalogDraft,
  signCatalogDraft,
} from "../lib/catalogDraft.js";
import { normalizeAddress } from "../lib/catalogMeta.js";
import { networkPlace } from "../lib/networkLabel.js";
import { fetchCreatorPolls, publishAccountPoll, refreshPollMetaById } from "../lib/polls.js";
import { navigate, pollPath } from "../lib/routing.js";
import { explainError } from "../lib/userMessages.js";

function chainBool(value) {
  if (typeof value === "boolean") return value;
  if (value && typeof value === "object" && "result" in value) return chainBool(value.result);
  return asFieldBigInt(value) !== 0n;
}

function sameChainValue(left, right) {
  return BigInt(left) === BigInt(right);
}

function rowStatus(row) {
  if (row.cancelled) return "Cancelled";
  if (row.voteEnded) return "Ended";
  if (row.endsAt && Date.parse(row.endsAt) <= Date.now()) return "Ended";
  return "Open";
}

function mergeRows(catalogPolls, openPolls, hiddenPolls = []) {
  const byId = new Map();
  for (const poll of catalogPolls) {
    const id = String(poll.id);
    byId.set(id, {
      id,
      title: poll.title || `Poll #${id}`,
      endsAt: poll.endsAt || null,
      listed: true,
      voteEnded: Boolean(poll.voteEnded),
      cancelled: Boolean(poll.cancelled),
      metadataHash: null,
      signingPubX: null,
    });
  }
  for (const open of openPolls) {
    if (!open?.id) throw new Error("Open poll slot is missing an id");
    const id = String(open.id);
    if (byId.has(id)) continue;
    byId.set(id, {
      id,
      title: `Poll #${id}`,
      endsAt: open.endsAt || null,
      listed: false,
      voteEnded: Boolean(open.voteEnded),
      cancelled: Boolean(open.cancelled),
      metadataHash: open.metadataHash ?? null,
      signingPubX: open.signingPubX ?? null,
    });
  }
  for (const hidden of hiddenPolls) {
    if (!hidden?.id) throw new Error("Hidden author poll is missing an id");
    const id = String(hidden.id);
    const existing = byId.get(id);
    byId.set(id, {
      ...(existing || {
        id,
        title: hidden.title || `Poll #${id}`,
        endsAt: hidden.endsAt || null,
        listed: Boolean(hidden.listed),
        voteEnded: Boolean(hidden.voteEnded),
        cancelled: Boolean(hidden.cancelled),
        metadataHash: null,
        signingPubX: null,
      }),
      hiddenAuthor: true,
      authorSecret: hidden.authorSecret,
    });
  }
  return [...byId.values()].sort((a, b) => Number(b.id) - Number(a.id));
}

async function loadHiddenPolls(wallet, address) {
  let slots;
  try {
    slots = await readHiddenAuthorSlots(wallet, address);
  } catch (error) {
    const text = String(error?.message || error || "");
    if (/unknown function|no function|selector|get_hidden_author_note/i.test(text)) return [];
    throw error;
  }
  const contract = await registerHappyVote(wallet);
  const from = AztecAddress.fromStringUnsafe(address);
  const rows = [];
  for (const slot of slots) {
    let title = `Poll #${slot.id}`;
    let listed = false;
    let endsAt = null;
    const meta = await refreshPollMetaById(slot.id);
    if (meta) {
      title = meta.title || title;
      listed = true;
      endsAt = meta.endsAt || null;
    }
    const pollId = pollIdFromRaw(slot.id);
    const [voteEnded, cancelled, chainEnds] = await Promise.all([
      contract.methods.get_vote_ended(pollId).simulate({ from }),
      contract.methods.get_cancelled(pollId).simulate({ from }),
      contract.methods.get_ends_at(pollId).simulate({ from }),
    ]);
    const endsSeconds = asFieldBigInt(chainEnds);
    rows.push({
      id: slot.id,
      title,
      listed,
      endsAt: endsAt || (endsSeconds > 0n ? new Date(Number(endsSeconds) * 1000).toISOString() : null),
      voteEnded: chainBool(voteEnded),
      cancelled: chainBool(cancelled),
      authorSecret: slot.secret,
    });
  }
  return rows;
}

export function MyPollsPanel({ walletConnect, active }) {
  const connected = walletConnect.phase.kind === "connected";
  const address = connected ? String(walletConnect.phase.address) : "";
  const [rows, setRows] = useState([]);
  const [draftPollId, setDraftPollId] = useState("");
  const [orphanId, setOrphanId] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [confirmId, setConfirmId] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchCreatorPolls(address);
      const wallet = walletConnect.phase.wallet;
      const hiddenPolls = wallet ? await loadHiddenPolls(wallet, address) : [];
      const next = mergeRows(data.polls, data.openPolls, hiddenPolls);
      let pendingId = "";
      let missingId = "";
      const draft = readCatalogDraft();
      const draftForThisWallet =
        draft &&
        (draft.hiddenAuthor || normalizeAddress(draft.creator) === normalizeAddress(address));
      if (draftForThisWallet) {
        const draftId = draft.pollId ? String(draft.pollId) : "";
        const draftRow = draftId ? next.find((row) => row.id === draftId) : null;
        if (draftRow?.listed) {
          clearCatalogDraft();
        } else if (draftRow) {
          pendingId = draftRow.id;
        } else {
          const hash = await catalogDraftContentHash(draft);
          const match = next.find(
            (row) =>
              !row.listed &&
              row.metadataHash != null &&
              row.signingPubX != null &&
              sameChainValue(hash, row.metadataHash) &&
              sameChainValue(draft.publicKey.x, row.signingPubX),
          );
          if (match) pendingId = match.id;
          else if (draftId) missingId = draftId;
        }
      }
      setDraftPollId(pendingId);
      setOrphanId(missingId);
      setRows(next);
    } catch (err) {
      console.error(err);
      const explained = explainError(err, "generic");
      setError(explained.text || err.message);
      setRows([]);
      setDraftPollId("");
      setOrphanId("");
    } finally {
      setLoading(false);
    }
  }, [address, walletConnect.phase.wallet]);

  useEffect(() => {
    if (!active || !address) return;
    void load();
  }, [active, address, load]);

  async function endPoll(row) {
    const wallet = walletConnect.phase.wallet;
    if (!wallet || !address) {
      setError("Connect the wallet that created this poll.");
      return;
    }
    setBusyId(row.id);
    setError("");
    setStatus("");
    try {
      setStatus(`Ending poll #${row.id}…`);
      await registerStandardContracts(wallet);
      const contract = await registerHappyVote(wallet);
      if (typeof contract.methods.end_poll !== "function") {
        throw new Error("This artifact has no end_poll entry.");
      }
      const from = AztecAddress.fromStringUnsafe(address);
      const pollId = pollIdFromRaw(row.id);
      const mainnet = networkPlace() === "mainnet";
      let call;
      let txOptions;
      if (row.hiddenAuthor) {
        if (mainnet && !authorFeeSponsorAddress()) {
          throw new Error(
            "Ending a private-author poll on Mainnet is paid by the AuthorFeeSponsor contract. This site has no sponsor address.",
          );
        }
        if (!row.authorSecret) throw new Error("This wallet has no secret for that private-author poll.");
        const book = await registerHiddenAuthorBook(wallet);
        txOptions = await hiddenAuthorFeeOptions(wallet);
        call = book.methods.end_hidden_poll(pollId.id, new Fr(BigInt(row.authorSecret)), 0, 0, 0);
      } else {
        txOptions = await accountFeeOptions(wallet, mainnet);
        call = contract.methods.end_poll(pollId);
      }
      await call.simulate({ from });
      await call.send({ from, ...txOptions, wait: { timeout: 600 } });
      setConfirmId("");
      setStatus(`Poll #${row.id} has ended.`);
      await load();
    } catch (err) {
      console.error(err);
      const explained = explainError(err, "generic");
      setError(explained.text || err.message);
      setStatus("");
    } finally {
      setBusyId("");
    }
  }

  async function publishListing(row) {
    setBusyId(row.id);
    setError("");
    setStatus("Publishing the listing…");
    try {
      const draft = readCatalogDraft();
      const draftMatches =
        draft &&
        (draft.hiddenAuthor || normalizeAddress(draft.creator) === normalizeAddress(address));
      if (!draftMatches) {
        throw new Error("The catalog signing key for this poll is not in this tab.");
      }
      const body = await signCatalogDraft(draft, row.id);
      await publishAccountPoll(body);
      clearCatalogDraft();
      setDraftPollId("");
      setStatus(`Poll #${row.id} is listed.`);
      await load();
    } catch (err) {
      console.error(err);
      const explained = explainError(err, "generic");
      setError(explained.text || err.message);
      setStatus("");
    } finally {
      setBusyId("");
    }
  }

  if (!connected) {
    return <p className="meta">Connect an Aztec wallet to see polls created by that address.</p>;
  }

  return (
    <div className="admin-form">
      <h2>Your polls</h2>
      <p className="meta">
        Public-author polls for this address, plus private-author polls whose secret is in this
        wallet. End closes voting from this wallet. A private ballot still hides the voter.
      </p>
      {loading ? <p className="status">Loading your polls…</p> : null}
      {!loading && rows.length === 0 && !error ? (
        <p className="meta">This address has not published a poll on this contract.</p>
      ) : null}
      {orphanId ? (
        <div className="mine-poll">
          <p className="meta">
            Poll #{orphanId} was created in this tab, and this list does not include it yet.
          </p>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={Boolean(busyId)}
            onClick={() => {
              clearCatalogDraft();
              setOrphanId("");
              setStatus(`The listing key for poll #${orphanId} was removed from this tab.`);
            }}
          >
            Dismiss listing key
          </button>
        </div>
      ) : null}
      {rows.length > 0 ? (
        <ul className="mine-polls">
          {rows.map((row) => {
            const statusLabel = rowStatus(row);
            const canEnd = !row.cancelled && !row.voteEnded;
            const timeClosed = row.endsAt && Date.parse(row.endsAt) <= Date.now();
            const busy = busyId === row.id;
            return (
              <li key={row.id} className="mine-poll">
                <div>
                  <h3>{row.title}</h3>
                  <p className="meta">
                    #{row.id} · {statusLabel}
                    {row.listed ? "" : " · on-chain only"}
                  </p>
                  {canEnd && timeClosed ? (
                    <p className="meta">
                      Voting is closed. End the poll to release its open slot and return leftover
                      pool funds.
                    </p>
                  ) : null}
                </div>
                <div className="admin-controls-row">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={Boolean(busyId)}
                    onClick={() => navigate(pollPath(row.id))}
                  >
                    Open
                  </button>
                  {draftPollId === row.id && !row.listed ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={Boolean(busyId)}
                        onClick={() => void publishListing(row)}
                      >
                        {busy ? "Publishing…" : "Publish listing"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={Boolean(busyId)}
                        onClick={() => {
                          clearCatalogDraft();
                          setDraftPollId("");
                          setStatus(`Poll #${row.id} stays on-chain without a public title.`);
                        }}
                      >
                        Leave untitled
                      </button>
                    </>
                  ) : null}
                  {canEnd && confirmId === row.id ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={Boolean(busyId)}
                        onClick={() => void endPoll(row)}
                      >
                        {busy ? "Ending…" : "Confirm end"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={Boolean(busyId)}
                        onClick={() => setConfirmId("")}
                      >
                        Keep open
                      </button>
                    </>
                  ) : null}
                  {canEnd && confirmId !== row.id ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={Boolean(busyId)}
                      onClick={() => setConfirmId(row.id)}
                    >
                      End poll
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {error ? (
        <p className="status" data-tone="error">
          {error}
        </p>
      ) : null}
      {status ? <p className="status">{status}</p> : null}
      {error ? (
        <button type="button" className="btn btn-ghost" disabled={loading || Boolean(busyId)} onClick={() => void load()}>
          Retry
        </button>
      ) : null}
    </div>
  );
}
