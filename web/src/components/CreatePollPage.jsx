import { useState } from "react";
import {
  AztecAddress,
  Fr,
  PRIVACY,
  asFieldBigInt,
  getSponsoredPaymentMethod,
  pollIdFromRaw,
  registerHappyVote,
  registerStandardContracts,
  senderFeeTxOptions,
  sponsoredTxOptions,
} from "../lib/aztecClient.js";
import {
  assertListingText,
  canonicalContent,
  canonicalListing,
  fieldFromUtf8,
  MAX_WINDOW_MS,
  normalizeAddress,
} from "../lib/catalogMeta.js";
import { publishAccountPoll } from "../lib/polls.js";
import { datetimeLocalToIso, isoToUnixSeconds } from "../lib/pollSchedule.js";
import { networkPlace } from "../lib/networkLabel.js";
import { FEE_FALLBACK, FEE_MODE } from "../lib/feeMode.js";
import { VOTE_FREQUENCY } from "../lib/voteFrequency.js";
import { explainError } from "../lib/userMessages.js";
import { navigate, pollPath } from "../lib/routing.js";
import { SiteFooter } from "./SiteFooter.jsx";
import { SiteHeader } from "./SiteHeader.jsx";
import { usePageSeo } from "../hooks/usePageSeo.js";
import { CREATE_PAGE_DESCRIPTION, pageTitle, webPageJsonLd } from "../lib/seo.js";
import { SITE_NAME } from "../lib/site.js";

const FEE_CODE = { sponsored: 0, voter: 1, pool: 2 };
const FALLBACK_CODE = { stop: 0, voter: 1 };
const PRIVACY_OPTIONS = [
  { value: PRIVACY.VOTER_CHOICE, label: "Voter choice" },
  { value: PRIVACY.PRIVATE_ONLY, label: "Private only" },
  { value: PRIVACY.PUBLIC_ONLY, label: "Open only" },
];
const VOTE_FREQUENCY_OPTIONS = [
  { value: VOTE_FREQUENCY.ONCE, label: "Once per poll" },
  { value: VOTE_FREQUENCY.DAILY, label: "Once every 24 hours" },
];

function privacyHint(policy) {
  if (policy === PRIVACY.PRIVATE_ONLY) {
    return "Private only: voters cannot publish their address. The chosen option still updates the live tally unless the poll is sealed.";
  }
  if (policy === PRIVACY.PUBLIC_ONLY) {
    return "Open only: address and choice are published on-chain. Voters cannot hide who they are.";
  }
  return "Voter choice: each voter picks private or open on the ballot page.";
}

function voteFrequencyHint(frequency) {
  if (frequency === VOTE_FREQUENCY.DAILY) {
    return "UTC calendar day: one private or open ballot per account from 00:00 to 24:00 UTC. Each day adds to the tally; yesterday’s choice is not subtracted.";
  }
  return "One ballot per Aztec account for the life of this poll. Switching private/open does not add a second vote.";
}

function fieldBigInt(value) {
  const text = typeof value?.toString === "function" ? value.toString() : String(value);
  return BigInt(text);
}

export function CreatePollPage({ walletConnect }) {
  const place = networkPlace();
  const mainnet = place === "mainnet";
  const connected = walletConnect.phase.kind === "connected";
  const signingKey = connected ? walletConnect.phase.signingKey : null;
  const sessionReady = Boolean(signingKey);
  const connectDialogOpen = !["idle", "connected", "disconnected"].includes(walletConnect.phase.kind);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [topics, setTopics] = useState("");
  const [optionRows, setOptionRows] = useState([
    { label: "Yes", description: "" },
    { label: "No", description: "" },
  ]);
  const [privacy, setPrivacy] = useState(PRIVACY.VOTER_CHOICE);
  const [important, setImportant] = useState(false);
  const [sealed, setSealed] = useState(false);
  const [voteFrequency, setVoteFrequency] = useState(VOTE_FREQUENCY.ONCE);
  const [feeMode, setFeeMode] = useState(mainnet ? FEE_MODE.VOTER : FEE_MODE.SPONSORED);
  const [feeFallback, setFeeFallback] = useState(FEE_FALLBACK.STOP);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  function setOptionRow(index, patch) {
    setOptionRows((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function publish() {
    setError("");
    setStatus("");
    let text;
    try {
      text = assertListingText({
        title,
        description,
        options: optionRows,
        topics: topics.split(","),
      });
      if (optionRows.some((row) => row.description.trim().length > 160)) {
        throw new Error("Each option description must be 160 characters or fewer.");
      }
    } catch (err) {
      setError(err.message);
      return;
    }
    const endIso = datetimeLocalToIso(endsAt);
    if (!endIso) {
      setError("An end time is required.");
      return;
    }
    const startIso = startsAt ? datetimeLocalToIso(startsAt) : null;
    const endMs = Date.parse(endIso);
    const startMs = startIso ? Date.parse(startIso) : Date.now();
    if (endMs <= startMs) {
      setError("The end must be after the start.");
      return;
    }
    if (endMs - startMs > MAX_WINDOW_MS) {
      setError("The poll must end within 90 days of its start.");
      return;
    }
    if (mainnet && feeMode === FEE_MODE.SPONSORED) {
      setError("Mainnet does not offer the Sponsored FPC for a new poll.");
      return;
    }
    if (!connected || !walletConnect.phase.wallet) {
      setError("Connect a browser session before publishing.");
      return;
    }
    if (!signingKey) {
      setError(
        "Publishing signs the catalog with the browser session key. That key stays in this tab and is not sent to the server. Connect a browser session, not an external wallet.",
      );
      return;
    }
    const wallet = walletConnect.phase.wallet;
    const creator = String(walletConnect.phase.address);
    setBusy(true);
    try {
      setStatus("Registering the contract…");
      await registerStandardContracts(wallet);
      const contract = await registerHappyVote(wallet);
      if (typeof contract.methods.create_user_poll !== "function") {
        throw new Error(
          "This HappyVote artifact has no create_user_poll entry. Compile with aztec compile, run codegen, and deploy that contract before a new listing can be published.",
        );
      }
      const contentHash = await fieldFromUtf8(canonicalContent(text));
      const contractAddress = String(import.meta.env.VITE_HAPPY_VOTE_CONTRACT_ADDRESS || "");
      if (!contractAddress) throw new Error("VITE_HAPPY_VOTE_CONTRACT_ADDRESS is not set");
      if (typeof contract.methods.get_creator !== "function") {
        throw new Error("This artifact has no get_creator view. The listing was not published.");
      }
      const { Schnorr } = await import("@aztec-labs/foundation/crypto/schnorr");
      const { Fr: BnFr } = await import("@aztec-labs/foundation/curves/bn254");
      const schnorr = new Schnorr();
      const point = await schnorr.computePublicKey(signingKey);
      const from = AztecAddress.fromStringUnsafe(creator);
      const before = asFieldBigInt(
        await contract.methods.get_next_poll_id().simulate({ from }),
      );
      const txOptions = mainnet
        ? await senderFeeTxOptions()
        : await sponsoredTxOptions(await getSponsoredPaymentMethod(wallet));
      setStatus("Proving the poll…");
      await contract.methods
        .create_user_poll(
          text.labels.length,
          privacy,
          important ? 1 : 0,
          new Fr(BigInt(contentHash)),
          sealed,
          isoToUnixSeconds(startIso),
          isoToUnixSeconds(endIso),
          voteFrequency,
          FEE_CODE[feeMode],
          FALLBACK_CODE[feeFallback],
          new Fr(fieldBigInt(point.x)),
          new Fr(fieldBigInt(point.y)),
        )
        .send({ from, ...txOptions, wait: { timeout: 600 } });
      const after = asFieldBigInt(await contract.methods.get_next_poll_id().simulate({ from }));
      const owned = [];
      for (let id = before; id < after; id += 1n) {
        const onChain = await contract.methods.get_creator(pollIdFromRaw(id.toString())).simulate({ from });
        const shown = String(onChain?.address ?? onChain);
        const match = shown.match(/0x[0-9a-fA-F]{1,64}/);
        if (match && normalizeAddress(match[0]) === normalizeAddress(creator)) owned.push(id);
      }
      if (owned.length !== 1) {
        throw new Error(
          "The new poll could not be tied to this account. The listing was not published.",
        );
      }
      const pollId = owned[0].toString();
      const signedListing = await fieldFromUtf8(
        canonicalListing({
          contract: contractAddress,
          pollId,
          title: text.title,
          description: text.description,
          options: text.labels,
          topics: text.topics,
        }),
      );
      const signature = await schnorr.constructSignature(new BnFr(BigInt(signedListing)), signingKey);
      const signatureBytes = signature.toBuffer();
      const signatureHex = [...signatureBytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      setStatus("Publishing the listing…");
      await publishAccountPoll({
        poll: {
          id: pollId,
          title: text.title,
          description: text.description,
          options: optionRows.map((row) => {
            const label = row.label.trim();
            const note = row.description.trim();
            return note ? { label, description: note } : { label };
          }),
          topics: text.topics,
          creator,
          privacyPolicy: privacy,
          eligibilityMode: important ? 1 : 0,
          sealed,
          voteFrequency,
          startsAt: startIso,
          endsAt: endIso,
        },
        signature: signatureHex,
        signingPublicKey: { x: fieldBigInt(point.x).toString(), y: fieldBigInt(point.y).toString() },
      });
      navigate(pollPath(pollId));
    } catch (err) {
      console.error(err);
      const explained = explainError(err, "generic");
      setError(explained.text || err.message);
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  const createTitle = pageTitle("Create a poll");
  usePageSeo({
    title: createTitle,
    description: CREATE_PAGE_DESCRIPTION,
    path: "/create",
    jsonLd: webPageJsonLd({
      title: createTitle,
      description: CREATE_PAGE_DESCRIPTION,
      path: "/create",
      breadcrumbs: [
        { name: SITE_NAME, path: "/" },
        { name: "Create a poll", path: "/create" },
      ],
    }),
  });

  return (
    <main className="app app-wide">
      <SiteHeader walletConnect={walletConnect} current="create" />
      <section className="catalog" aria-label="Create a poll">
        <header className="catalog-hero">
          <p className="vote-kicker">Create</p>
          <h1 className="catalog-hero-title">Publish a poll</h1>
          <p className="lede">
            {sessionReady
              ? "A private ballot hides your address. The tally is public unless you seal it until the poll ends."
              : "Connect a browser session, then write the question. The catalog signature stays in this tab."}
          </p>
        </header>

        {sessionReady ? (
          <form
            className="admin-form"
            onSubmit={(event) => {
              event.preventDefault();
              void publish();
            }}
          >
            <h2>Create poll</h2>
            <p className="meta">
              On-chain: option count, ballot privacy, vote frequency, eligibility, sealed flag, end
              time, and metadata hash. Labels stay in the shared catalog.
            </p>

            <fieldset className="zk-req">
              <legend>Details</legend>
              <label>
                Title
                <input
                  type="text"
                  value={title}
                  disabled={busy}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Should we adopt proposal X?"
                  maxLength={140}
                  required
                />
              </label>
              <label>
                Description
                <input
                  type="text"
                  value={description}
                  disabled={busy}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Optional short context"
                  maxLength={280}
                />
              </label>
              <label>
                Topics (comma-separated)
                <input
                  type="text"
                  value={topics}
                  disabled={busy}
                  onChange={(event) => setTopics(event.target.value)}
                  placeholder="governance, elections, demo"
                />
              </label>
            </fieldset>

            <fieldset className="option-editor">
              <legend>Options</legend>
              <p className="meta">Label is required. Description is optional and shown under the choice.</p>
              {optionRows.map((row, index) => (
                <div className="option-editor-row" key={`opt-${index}`}>
                  <label>
                    Label
                    <input
                      type="text"
                      value={row.label}
                      disabled={busy}
                      onChange={(event) => setOptionRow(index, { label: event.target.value })}
                      placeholder={`Option ${index + 1}`}
                      maxLength={80}
                      required
                    />
                  </label>
                  <label>
                    Description
                    <input
                      type="text"
                      value={row.description}
                      disabled={busy}
                      onChange={(event) => setOptionRow(index, { description: event.target.value })}
                      placeholder="Optional short explanation"
                      maxLength={160}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-ghost option-editor-remove"
                    disabled={busy || optionRows.length <= 2}
                    onClick={() => setOptionRows(optionRows.filter((_, i) => i !== index))}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy || optionRows.length >= 32}
                onClick={() => setOptionRows([...optionRows, { label: "", description: "" }])}
              >
                Add option
              </button>
            </fieldset>

            <fieldset className="zk-req">
              <legend>Voting type</legend>
              <p className="meta">
                Poll-level ballot policy. This is stored on-chain and cannot be changed after create.
              </p>
              <div className="privacy-row" role="radiogroup" aria-label="Ballot privacy policy">
                {PRIVACY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className="chip"
                    role="radio"
                    aria-checked={privacy === option.value}
                    aria-pressed={privacy === option.value}
                    disabled={busy}
                    onClick={() => setPrivacy(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="meta">{privacyHint(privacy)}</p>
              <p className="meta">
                How often one Aztec account (and one ZKPassport identity, if required) may ballot.
                Private and open votes share this limit. Cannot be changed after create.
              </p>
              <div className="privacy-row" role="radiogroup" aria-label="Vote frequency">
                {VOTE_FREQUENCY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className="chip"
                    role="radio"
                    aria-checked={voteFrequency === option.value}
                    aria-pressed={voteFrequency === option.value}
                    disabled={busy}
                    onClick={() => setVoteFrequency(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="meta">{voteFrequencyHint(voteFrequency)}</p>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={sealed}
                  disabled={busy}
                  onChange={(event) => setSealed(event.target.checked)}
                />
                Sealed tallies — hide results until the poll ends
              </label>
            </fieldset>

            <fieldset className="zk-req">
              <legend>Schedule</legend>
              <p className="meta">
                End is required and must be within 90 days. Start can stay empty. You can publish
                before the start — connect and vote unlock automatically, then lock at the end.
              </p>
              <div className="schedule-grid">
                <label>
                  Starts at
                  <input
                    type="datetime-local"
                    value={startsAt}
                    disabled={busy}
                    onChange={(event) => setStartsAt(event.target.value)}
                  />
                </label>
                <label>
                  Ends at
                  <input
                    type="datetime-local"
                    value={endsAt}
                    disabled={busy}
                    onChange={(event) => setEndsAt(event.target.value)}
                    required
                  />
                </label>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy || (!startsAt && !endsAt)}
                onClick={() => {
                  setStartsAt("");
                  setEndsAt("");
                }}
              >
                Clear dates
              </button>
            </fieldset>

            <fieldset className="zk-req">
              <legend>Voter eligibility</legend>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={important}
                  disabled={busy}
                  onChange={(event) => setImportant(event.target.checked)}
                />
                Important poll — require ZKPassport
              </label>
              <p className="meta">
                {important
                  ? "Voters prove personhood. Age, nationality, and document rules are not set on this form."
                  : "Any Aztec account can ballot. Turn this on to require ZKPassport personhood."}
              </p>
            </fieldset>

            <fieldset className="zk-req">
              <legend>Ballot fee</legend>
              <label>
                Network fee for ballots
                <select value={feeMode} disabled={busy} onChange={(event) => setFeeMode(event.target.value)}>
                  {mainnet ? null : <option value={FEE_MODE.SPONSORED}>Sponsored FPC</option>}
                  <option value={FEE_MODE.VOTER}>Voter pays Fee Juice</option>
                  <option value={FEE_MODE.POOL}>Poll pool</option>
                </select>
              </label>
              <label>
                If that fee cannot be paid
                <select
                  value={feeFallback}
                  disabled={busy}
                  onChange={(event) => setFeeFallback(event.target.value)}
                >
                  <option value={FEE_FALLBACK.STOP}>Keep Vote closed</option>
                  <option value={FEE_FALLBACK.VOTER}>Ask the voter to pay Fee Juice</option>
                </select>
              </label>
              <p className="meta">
                {mainnet
                  ? "On Mainnet the default is the voter’s Fee Juice. Creating the poll also pays Fee Juice."
                  : "On Testnet the first poll you create in a UTC day can use the Sponsored FPC. A second create that day is rejected. The ballot fee mode above is separate and stays fixed."}{" "}
                Homepage placement is chosen by HappyVote, not by this form.
              </p>
            </fieldset>

            {error ? (
              <p className="status" data-tone="error">
                {error}
              </p>
            ) : null}
            {status ? <p className="status">{status}</p> : null}
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Creating poll…" : "Create poll on-chain"}
            </button>
          </form>
        ) : (
          <div className="create-gate">
            {connected && !signingKey ? (
              <p className="status" data-tone="error">
                This connection cannot sign a new poll. Connect a browser session.
              </p>
            ) : null}
            {connectDialogOpen ? (
              <p className="status">Finish connecting in the dialog.</p>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => walletConnect.start()}>
                Connect browser session
              </button>
            )}
          </div>
        )}
      </section>
      <SiteFooter disclaimer="HappyVote is a technology layer on Aztec Network. It is not an official electoral authority." />
    </main>
  );
}
