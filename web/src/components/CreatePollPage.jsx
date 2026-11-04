import { useMemo, useState } from "react";
import {
  AztecAddress,
  Fr,
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
import { PollCard } from "./PollCard.jsx";
import { SiteFooter } from "./SiteFooter.jsx";
import { SiteHeader } from "./SiteHeader.jsx";
import { usePageSeo } from "../hooks/usePageSeo.js";
import { CREATE_PAGE_DESCRIPTION, pageTitle, webPageJsonLd } from "../lib/seo.js";
import { SITE_NAME } from "../lib/site.js";

const FEE_CODE = { sponsored: 0, voter: 1, pool: 2 };
const FALLBACK_CODE = { stop: 0, voter: 1 };

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
  const [topics, setTopics] = useState("community");
  const [options, setOptions] = useState(["Yes", "No"]);
  const [privacy, setPrivacy] = useState(2);
  const [eligibility, setEligibility] = useState(0);
  const [sealed, setSealed] = useState(false);
  const [daily, setDaily] = useState(false);
  const [feeMode, setFeeMode] = useState(mainnet ? FEE_MODE.VOTER : FEE_MODE.SPONSORED);
  const [feeFallback, setFeeFallback] = useState(FEE_FALLBACK.STOP);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const preview = useMemo(
    () => ({
      id: "new",
      title: title.trim() || "Poll title",
      description: description.trim(),
      topics: topics
        .split(",")
        .map((topic) => topic.trim().toLowerCase())
        .filter(Boolean),
      options: options.map((label) => ({ label: label || "Option" })),
      requiresZkPassport: eligibility > 0,
      eligibilityMode: eligibility,
      sealed,
      voteFrequency: daily ? 1 : 0,
      startsAt: startsAt ? datetimeLocalToIso(startsAt) : null,
      endsAt: endsAt ? datetimeLocalToIso(endsAt) : null,
      publisher: "account",
    }),
    [title, description, topics, options, eligibility, sealed, daily, startsAt, endsAt],
  );

  function setOption(index, value) {
    setOptions((rows) => rows.map((row, i) => (i === index ? value : row)));
  }

  async function publish() {
    setError("");
    setStatus("");
    let text;
    try {
      text = assertListingText({
        title,
        description,
        options,
        topics: topics.split(","),
      });
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
          eligibility,
          new Fr(BigInt(contentHash)),
          sealed,
          isoToUnixSeconds(startIso),
          isoToUnixSeconds(endIso),
          daily ? VOTE_FREQUENCY.DAILY : VOTE_FREQUENCY.ONCE,
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
          options: text.labels,
          topics: text.topics,
          creator,
          privacyPolicy: privacy,
          eligibilityMode: eligibility,
          sealed,
          voteFrequency: daily ? 1 : 0,
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
          Connect a browser session, then publish the poll. A private ballot hides your address. The
          tally is public unless you seal it until the poll ends.
        </p>
      </header>

      {sessionReady ? (
      <div className="create-layout">
        <form
          className="create-form"
          onSubmit={(event) => {
            event.preventDefault();
            void publish();
          }}
        >
          <label className="filter-field">
            Title
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={140} required />
          </label>
          <label className="filter-field">
            Description
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={280}
              rows={3}
            />
          </label>
          <fieldset className="create-options">
            <legend>Options</legend>
            {options.map((label, index) => (
              <label key={index} className="filter-field">
                Option {index + 1}
                <input value={label} onChange={(event) => setOption(index, event.target.value)} maxLength={80} />
              </label>
            ))}
            <div className="create-option-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setOptions(["Yes", "No"])}
              >
                Yes / No
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setOptions(["1", "2", "3", "4", "5"])}
              >
                Scale 1–5
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={options.length >= 32}
                onClick={() => setOptions((rows) => [...rows, ""])}
              >
                Add option
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={options.length <= 2}
                onClick={() => setOptions((rows) => rows.slice(0, -1))}
              >
                Remove option
              </button>
            </div>
          </fieldset>
          <label className="filter-field">
            Topics
            <input
              value={topics}
              onChange={(event) => setTopics(event.target.value)}
              placeholder="comma-separated, up to 8"
            />
          </label>
          <label className="filter-field">
            Privacy
            <select value={privacy} onChange={(event) => setPrivacy(Number(event.target.value))}>
              <option value={2}>Voter chooses private or open</option>
              <option value={0}>Private only</option>
              <option value={1}>Open only</option>
            </select>
          </label>
          <label className="filter-field">
            Eligibility
            <select value={eligibility} onChange={(event) => setEligibility(Number(event.target.value))}>
              <option value={0}>Open to any account</option>
              <option value={1}>ZKPassport personhood</option>
            </select>
          </label>
          <label className="filter-field">
            <input type="checkbox" checked={sealed} onChange={(event) => setSealed(event.target.checked)} /> Sealed
            tally until close
          </label>
          <label className="filter-field">
            <input type="checkbox" checked={daily} onChange={(event) => setDaily(event.target.checked)} /> One ballot
            per account per UTC day
          </label>
          <label className="filter-field">
            Start
            <input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
          </label>
          <label className="filter-field">
            End
            <input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} required />
          </label>
          <label className="filter-field">
            Network fee for ballots
            <select value={feeMode} onChange={(event) => setFeeMode(event.target.value)}>
              {mainnet ? null : <option value={FEE_MODE.SPONSORED}>Sponsored FPC</option>}
              <option value={FEE_MODE.VOTER}>Voter pays Fee Juice</option>
              <option value={FEE_MODE.POOL}>Poll pool</option>
            </select>
          </label>
          <label className="filter-field">
            If that fee cannot be paid
            <select value={feeFallback} onChange={(event) => setFeeFallback(event.target.value)}>
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
          {error ? (
            <p className="status" data-tone="error">
              {error}
            </p>
          ) : null}
          {status ? <p className="status">{status}</p> : null}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Publishing…" : "Publish poll"}
          </button>
        </form>
        <div>
          <h2 className="section-title">Preview</h2>
          <PollCard poll={preview} now={Date.now()} closed={false} preview />
        </div>
      </div>
      ) : (
        <div className="vote-cta">
          <p className="hint">
            The listing is signed in this tab. That key is not sent to the server. An external wallet
            cannot publish a poll.
          </p>
          {connected && !signingKey ? (
            <p className="status" data-tone="error">
              This connection cannot sign a new poll. Connect a browser session.
            </p>
          ) : null}
          {connectDialogOpen ? (
            <p className="status">Finish connecting in the dialog.</p>
          ) : (
            <div className="vote-cta-actions">
              <button type="button" className="btn btn-primary" onClick={() => walletConnect.start()}>
                Connect browser session
              </button>
            </div>
          )}
        </div>
      )}
    </section>
      <SiteFooter disclaimer="HappyVote is a technology layer on Aztec Network. It is not an official electoral authority." />
    </main>
  );
}
