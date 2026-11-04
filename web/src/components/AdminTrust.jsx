import { useEffect, useState } from "react";
import { AztecAddress, sponsoredTxOptions } from "../lib/aztecClient.js";
import { normalizeAddress } from "../lib/catalogMeta.js";
import { publishAuthoritativeAccount, publishHiddenPoll, fetchAuthoritativeAccounts } from "../lib/polls.js";
import { explainError } from "../lib/userMessages.js";

/**
 * Operator-only. The mark is an Aztec address flag, not a passport or a ballot.
 */
export function AdminTrust({
  contract,
  accountAddress,
  paymentMethod,
  busy,
  setBusy,
  setStatus,
}) {
  const [address, setAddress] = useState("");
  const [pollId, setPollId] = useState("");
  const [token, setToken] = useState(
    () =>
      (typeof sessionStorage !== "undefined" && sessionStorage.getItem("happyvote.publishToken")) ||
      import.meta.env.VITE_POLLS_PUBLISH_TOKEN ||
      "",
  );
  const [accounts, setAccounts] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchAuthoritativeAccounts(token);
        if (!cancelled) setAccounts(list);
      } catch {
        if (!cancelled) setAccounts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function setMark(enabled) {
    let normalized;
    try {
      normalized = normalizeAddress(address);
    } catch (error) {
      setStatus({ tone: "error", title: "Check the address", text: error.message });
      return;
    }
    if (typeof contract.methods.set_authoritative !== "function") {
      setStatus({
        tone: "error",
        title: "Contract upgrade required",
        text: "set_authoritative is not in this artifact. Compile and deploy the Iteration 2 contract before granting the mark. The catalog will not show it until the chain flag matches.",
      });
      return;
    }
    setBusy(true);
    try {
      const from = AztecAddress.fromStringUnsafe(accountAddress.toString());
      const txOptions = await sponsoredTxOptions(paymentMethod);
      setStatus({ text: enabled ? "Granting the mark…" : "Removing the mark…", tone: "neutral" });
      await contract.methods.set_authoritative(AztecAddress.fromStringUnsafe(normalized), enabled).send({
        from,
        ...txOptions,
        wait: { timeout: 600 },
      });
      await publishAuthoritativeAccount({ address: normalized, enabled }, token);
      const list = await fetchAuthoritativeAccounts(token);
      setAccounts(list);
      setStatus({
        text: enabled
          ? "Authoritative mark saved. That account’s polls can sit in Авторитетные голосования."
          : "Mark removed.",
        tone: "ok",
      });
    } catch (error) {
      console.error(error);
      setStatus({ tone: "error", ...explainError(error, "generic") });
    } finally {
      setBusy(false);
    }
  }

  async function hide(hidden) {
    const id = String(pollId || "").trim();
    if (!/^\d+$/.test(id)) {
      setStatus({ tone: "error", title: "Poll id", text: "Enter the poll number to hide or restore." });
      return;
    }
    setBusy(true);
    try {
      await publishHiddenPoll({ id, hidden }, token);
      setStatus({
        text: hidden
          ? `Poll #${id} is hidden from All polls and the homepage. /p/${id} still opens and says the card was hidden.`
          : `Poll #${id} is listed again.`,
        tone: "ok",
      });
    } catch (error) {
      console.error(error);
      setStatus({ tone: "error", ...explainError(error, "generic") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-trust">
      <h2 className="section-title">Authoritative accounts</h2>
      <p className="meta">
        The mark is public on the account that publishes polls. It does not identify a voter and it does
        not store a passport. Only the contract admin can set it.
      </p>
      <label className="filter-field">
        Aztec address
        <input value={address} onChange={(event) => setAddress(event.target.value)} spellCheck={false} />
      </label>
      <label className="filter-field">
        Publish token
        <input
          value={token}
          onChange={(event) => {
            setToken(event.target.value);
            sessionStorage.setItem("happyvote.publishToken", event.target.value);
          }}
          spellCheck={false}
        />
      </label>
      <div className="create-option-actions">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void setMark(true)}>
          Grant authoritative
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void setMark(false)}>
          Remove mark
        </button>
      </div>
      {accounts.length > 0 ? (
        <ul className="trust-list">
          {accounts.map((item) => (
            <li key={item}>
              <code>{item}</code>
            </li>
          ))}
        </ul>
      ) : (
        <p className="meta">No authoritative accounts in the catalog yet.</p>
      )}

      <h2 className="section-title">Hide a listing</h2>
      <p className="meta">
        Hiding removes the card from All polls and the homepage. Cancel, on the Contract tab, stops
        voting. Neither erases the chain row.
      </p>
      <label className="filter-field">
        Poll id
        <input value={pollId} onChange={(event) => setPollId(event.target.value)} inputMode="numeric" />
      </label>
      <div className="create-option-actions">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void hide(true)}>
          Hide card
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void hide(false)}>
          Show card
        </button>
      </div>
    </div>
  );
}
