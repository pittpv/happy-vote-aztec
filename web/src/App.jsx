import { useEffect, useState } from "react";
import {
  PRIVACY,
  getNodeUrl,
  readTallies,
  readPublicPollState,
  asFieldBigInt,
  registerHappyVote,
  registerStandardContracts,
  getSponsoredPaymentMethod,
  createWallet,
  deployAccount,
  importAccount,
  pollIdFromRaw,
  Fr,
  AztecAddress,
} from "./lib/aztecClient.js";
import { FEE_JUICE_FAUCET_URL } from "./lib/walletClient.js";
import {
  getPollMeta,
  hasKnownPollMeta,
  explorerTxUrl,
  explorerAddressUrl,
  pollPath,
  refreshSharedCatalog,
  markVoted,
  hasVotedReceipt,
  reportClientError,
  pollOptionLabels,
} from "./lib/polls.js";
import { parseRoute, navigate, homePath } from "./lib/routing.js";
import { ZkPassportGate } from "./components/ZkPassportGate.jsx";
import { WalletConnectModal } from "./components/WalletConnectModal.jsx";
import { AdminCreatePollForm } from "./components/AdminCreatePollForm.jsx";
import { AdminContractControls } from "./components/AdminContractControls.jsx";
import { PollListPage } from "./components/PollListPage.jsx";
import { useWalletConnect } from "./hooks/useWalletConnect.js";
import { useNow } from "./hooks/useNow.js";
import { LegalPage } from "./components/LegalPage.jsx";
import { SiteFooter } from "./components/SiteFooter.jsx";
import { PollScheduleBanner } from "./components/PollScheduleBanner.jsx";
import { identityCommitmentFromUid } from "./lib/zkIdentity.js";
import { isBbWasmAbort } from "./lib/browser.js";
import { ELIGIBILITY_MODE } from "./lib/zkRequirements.js";
import {
  POLL_PHASE,
  assertVotingOpen,
  formatCountdown,
  getPollSchedule,
  isVotingOpen,
  unixSecondsToIso,
} from "./lib/pollSchedule.js";
import { SITE_NAME } from "./lib/site.js";
import { metaDescription, pageTitle, webPageJsonLd } from "./lib/seo.js";
import { usePageSeo } from "./hooks/usePageSeo.js";

function envRequiresZkPassport() {
  return import.meta.env.VITE_REQUIRE_ZKPASSPORT === "true";
}

export default function App() {
  const [route, setRoute] = useState(() => parseRoute());

  useEffect(() => {
    function onPopState() {
      setRoute(parseRoute());
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  if (route.kind === "home") {
    return <PollListPage />;
  }

  if (route.kind === "admin") {
    return <AdminRoute />;
  }

  if (route.kind === "legal") {
    return <LegalPage slug={route.slug} />;
  }

  return <PollVoteRoute pollId={route.pollId} />;
}

function AdminRoute() {
  const [status, setStatus] = useState({
    text: "Import admin keys to create polls",
    tone: "neutral",
  });
  const [busy, setBusy] = useState(false);
  const [accountAddress, setAccountAddress] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [contract, setContract] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const walletConnect = useWalletConnect();
  const contractAddressStr = import.meta.env.VITE_HAPPY_VOTE_CONTRACT_ADDRESS
    ? String(import.meta.env.VITE_HAPPY_VOTE_CONTRACT_ADDRESS)
    : "";
  const contractAddress = contractAddressStr
    ? AztecAddress.fromStringUnsafe(contractAddressStr)
    : null;

  useEffect(() => {
    if (walletConnect.phase.kind !== "connected") return;
    const { wallet: nextWallet, address } = walletConnect.phase;
    let cancelled = false;
    (async () => {
      try {
        setBusy(true);
        setStatus({ text: "Registering contracts…", tone: "neutral" });
        await registerStandardContracts(nextWallet);
        if (cancelled) return;
        const nextPayment = await getSponsoredPaymentMethod(nextWallet);
        if (cancelled) return;
        if (!contractAddress) {
          setAccountAddress(AztecAddress.fromStringUnsafe(String(address)));
          setPaymentMethod(nextPayment);
          setStatus({ text: "Set VITE_HAPPY_VOTE_CONTRACT_ADDRESS to manage polls.", tone: "error" });
          return;
        }
        const nextContract = await registerHappyVote(nextWallet);
        if (cancelled) return;
        const from = AztecAddress.fromStringUnsafe(String(address));
        const adminRaw = await nextContract.methods.get_admin().simulate({ from });
        if (cancelled) return;
        const adminAddr = unwrapAztecAddress(adminRaw);
        const ok = addressesEqual(from, adminAddr);
        setAccountAddress(from);
        setPaymentMethod(nextPayment);
        setContract(nextContract);
        setIsAdmin(ok);
        setStatus({
          text: ok
            ? `Admin connected · ${shortAddr(from.toString())}`
            : `Connected ${shortAddr(from.toString())} is not contract admin`,
          tone: ok ? "ok" : "error",
        });
      } catch (error) {
        if (cancelled) return;
        console.error(error);
        setStatus({ text: formatConnectError(error), tone: "error" });
        walletConnect.disconnectWallet();
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletConnect.phase]);

  useEffect(() => {
    if (walletConnect.phase.kind === "disconnected") {
      setAccountAddress(null);
      setPaymentMethod(null);
      setContract(null);
      setIsAdmin(false);
      setStatus({ text: "Disconnected", tone: "neutral" });
    }
  }, [walletConnect.phase.kind]);

  usePageSeo({
    title: pageTitle("Admin"),
    description: "Import deploy keys and create polls on HappyVote on Aztec.",
    path: "/admin",
    noindex: true,
  });

  async function connectSession(importedKeys) {
    walletConnect.reset();
    setBusy(true);
    const onProgress = (text) => setStatus({ text, tone: "neutral" });
    try {
      const proverEnabled = import.meta.env.VITE_PROVER_ENABLED === "true";
      const nextWallet = await createWallet({ proverEnabled, onProgress });
      const { account: nextAccount } = importedKeys
        ? await importAccount(nextWallet, importedKeys, { onProgress })
        : await deployAccount(nextWallet, { onProgress });
      // Trigger finish via fake connected phase path: call register inline
      setStatus({ text: "Registering contracts…", tone: "neutral" });
      await registerStandardContracts(nextWallet);
      const nextPayment = await getSponsoredPaymentMethod(nextWallet);
      if (!contractAddress) {
        setAccountAddress(nextAccount.address);
        setPaymentMethod(nextPayment);
        setStatus({ text: "Set contract address env.", tone: "error" });
        return;
      }
      const nextContract = await registerHappyVote(nextWallet);
      const from = nextAccount.address;
      const adminRaw = await nextContract.methods.get_admin().simulate({ from });
      const adminAddr = unwrapAztecAddress(adminRaw);
      const ok = addressesEqual(from, adminAddr);
      setAccountAddress(from);
      setPaymentMethod(nextPayment);
      setContract(nextContract);
      setIsAdmin(ok);
      setStatus({
        text: ok
          ? `Admin connected · ${shortAddr(from.toString())}`
          : `Connected ${shortAddr(from.toString())} is not contract admin`,
        tone: ok ? "ok" : "error",
      });
    } catch (error) {
      console.error(error);
      setStatus({ text: formatConnectError(error), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app app-wide">
      <nav className="page-nav">
        <button type="button" className="btn btn-ghost" onClick={() => navigate(homePath())}>
          ← Polls
        </button>
      </nav>
      <h1 className="brand">
        HappyVote <span>Admin</span>
      </h1>
      <p className="lede">Import deploy keys, then create polls with ZKPassport eligibility rules.</p>

      <div className="actions">
        {!accountAddress ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={walletConnect.start}
          >
            Connect admin
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => {
              walletConnect.disconnectWallet();
              setAccountAddress(null);
              setPaymentMethod(null);
              setContract(null);
              setIsAdmin(false);
            }}
          >
            Disconnect
          </button>
        )}
      </div>

      <p className="status" data-tone={status.tone === "neutral" ? undefined : status.tone}>
        {status.text}
      </p>

      {isAdmin && accountAddress && contract && paymentMethod ? (
        <section className="admin" aria-label="Admin">
          <AdminContractControls
            contract={contract}
            accountAddress={accountAddress}
            paymentMethod={paymentMethod}
            busy={busy}
            setBusy={setBusy}
            setStatus={setStatus}
            onAdminTransferred={() => {
              setIsAdmin(false);
              setStatus({
                text: "Admin transferred. This account can no longer manage the contract.",
                tone: "ok",
              });
            }}
          />
          <AdminCreatePollForm
            contract={contract}
            accountAddress={accountAddress}
            paymentMethod={paymentMethod}
            busy={busy}
            setBusy={setBusy}
            setStatus={setStatus}
            onCreated={(meta) => navigate(pollPath(meta.id))}
          />
        </section>
      ) : accountAddress && !isAdmin ? (
        <p className="meta">
          This account is not the HappyVote admin. Import SECRET_KEY / SIGNING_KEY / SALT from{" "}
          <code>aztec/.env</code>.
        </p>
      ) : null}

      <WalletConnectModal
        phase={walletConnect.phase}
        pickProvider={walletConnect.pickProvider}
        confirm={walletConnect.confirm}
        reject={walletConnect.reject}
        reset={walletConnect.reset}
        pickAccount={walletConnect.pickAccount}
        beginDiscovery={walletConnect.beginDiscovery}
        beginSession={() => connectSession()}
        beginSessionWithKeys={(keys) => connectSession(keys)}
        allowAdminImport
      />

      <SiteFooter
        disclaimer="HappyVote is a technology layer on Aztec Network. It is not an official electoral authority."
      />
    </main>
  );
}

function PollVoteRoute({ pollId: routePollId }) {
  const [pollMeta, setPollMeta] = useState(() => getPollMeta(routePollId));
  const options = pollMeta.options;
  const optionLabels = pollOptionLabels(options);
  const requiresZk =
    Boolean(pollMeta.requiresZkPassport) || envRequiresZkPassport();

  const [status, setStatus] = useState({
    text: "Read-only mode · connect a wallet to vote",
    tone: "neutral",
  });
  const [lastTxHash, setLastTxHash] = useState(null);
  const [accountAddress, setAccountAddress] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [contract, setContract] = useState(null);
  const [selected, setSelected] = useState(0);
  const [privacyMode, setPrivacyMode] = useState("private");
  const [busy, setBusy] = useState(false);
  const [tallies, setTallies] = useState(() => optionLabels.map(() => 0));
  const [total, setTotal] = useState(0);
  const [policy, setPolicy] = useState(PRIVACY.VOTER_CHOICE);
  const [voteEnded, setVoteEnded] = useState(false);
  const [onChainSealed, setOnChainSealed] = useState(Boolean(pollMeta.sealed));
  const [chainStartsAt, setChainStartsAt] = useState(null);
  const [chainEndsAt, setChainEndsAt] = useState(null);
  const [cancelled, setCancelled] = useState(false);
  const [paused, setPaused] = useState(false);
  const [zkId, setZkId] = useState(null);
  const [zkServerVerified, setZkServerVerified] = useState(false);
  const [shareHint, setShareHint] = useState("");
  const [votedReceipt, setVotedReceipt] = useState(() => hasVotedReceipt(routePollId));
  const now = useNow(1000);
  const schedule = getPollSchedule(
    {
      startsAt: unixSecondsToIso(chainStartsAt) || pollMeta.startsAt,
      endsAt: unixSecondsToIso(chainEndsAt) || pollMeta.endsAt,
    },
    now,
  );
  const closedOnChain = voteEnded || cancelled;
  const votingOpen = !paused && isVotingOpen(schedule, closedOnChain);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refreshSharedCatalog();
      if (!cancelled) setPollMeta(getPollMeta(routePollId));
    })();
    return () => {
      cancelled = true;
    };
  }, [routePollId]);

  const walletConnect = useWalletConnect();
  const contractAddressStr = import.meta.env.VITE_HAPPY_VOTE_CONTRACT_ADDRESS
    ? String(import.meta.env.VITE_HAPPY_VOTE_CONTRACT_ADDRESS)
    : "";
  const contractAddress = contractAddressStr
    ? AztecAddress.fromStringUnsafe(contractAddressStr)
    : null;
  const pollId = pollIdFromRaw(routePollId);
  const pollKnown = hasKnownPollMeta(routePollId);
  const identityOk = pollKnown && (!requiresZk || Boolean(zkId));
  const canVote =
    votingOpen &&
    Boolean(accountAddress && contract && identityOk && !busy) &&
    (policy === PRIVACY.VOTER_CHOICE ||
      (policy === PRIVACY.PRIVATE_ONLY && privacyMode === "private") ||
      (policy === PRIVACY.PUBLIC_ONLY && privacyMode === "open"));

  useEffect(() => {
    setSelected(0);
    setTallies(optionLabels.map(() => 0));
    setTotal(0);
    setLastTxHash(null);
    setZkId(null);
    setZkServerVerified(false);
    setShareHint("");
    setVotedReceipt(hasVotedReceipt(routePollId));
    setOnChainSealed(Boolean(getPollMeta(routePollId).sealed));
    setChainStartsAt(null);
    setChainEndsAt(null);
    setCancelled(false);
    setPaused(false);
    setVoteEnded(false);
    setPollMeta(getPollMeta(routePollId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routePollId]);

  useEffect(() => {
    if (!contractAddressStr) {
      setStatus({
        text: "Set VITE_HAPPY_VOTE_CONTRACT_ADDRESS after deploy to enable chain reads.",
        tone: "neutral",
      });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setStatus({ text: "Loading public tallies…", tone: "neutral" });
        const result = await readPublicPollState(pollId, optionLabels.length);
        if (cancelled) return;
        setTallies(result.tallies);
        setTotal(result.total);
        setPolicy(result.policy);
        if (result.policy === PRIVACY.PRIVATE_ONLY) setPrivacyMode("private");
        if (result.policy === PRIVACY.PUBLIC_ONLY) setPrivacyMode("open");
        if (result.sealed != null) setOnChainSealed(Boolean(result.sealed));
        if (result.voteEnded != null) setVoteEnded(Boolean(result.voteEnded));
        if (result.cancelled != null) setCancelled(Boolean(result.cancelled));
        if (result.paused != null) setPaused(Boolean(result.paused));
        if (result.startsAt != null) setChainStartsAt(result.startsAt);
        if (result.endsAt != null) setChainEndsAt(result.endsAt);
        setStatus({
          text: "Public tallies · connect a wallet to vote",
          tone: "neutral",
        });
      } catch (error) {
        if (cancelled) return;
        console.error(error);
        setStatus({
          text: `Could not load tallies: ${error?.message || String(error)}`,
          tone: "error",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractAddressStr, routePollId]);

  useEffect(() => {
    if (walletConnect.phase.kind !== "connected") return;
    const { wallet: nextWallet, address } = walletConnect.phase;
    let cancelled = false;

    (async () => {
      try {
        await finishConnect(nextWallet, AztecAddress.fromStringUnsafe(String(address)), {
          onCancelCheck: () => cancelled,
        });
      } catch (error) {
        if (cancelled) return;
        console.error(error);
        setStatus({
          text: formatConnectError(error),
          tone: "error",
        });
        walletConnect.disconnectWallet();
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletConnect.phase]);

  useEffect(() => {
    if (walletConnect.phase.kind === "disconnected") {
      clearSession();
      setStatus({
        text: "Wallet disconnected · public tallies stay visible · reconnect to vote",
        tone: "neutral",
      });
      void refreshTallies(null, null).catch((error) => {
        console.error(error);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletConnect.phase.kind]);

  const pollSeoTitle = pageTitle(pollMeta.title);
  const pollSeoDescription = metaDescription(pollMeta.description);
  const pollSeoPath = pollPath(routePollId);
  usePageSeo({
    title: pollSeoTitle,
    description: pollSeoDescription,
    path: pollSeoPath,
    jsonLd: webPageJsonLd({
      title: pollSeoTitle,
      description: pollSeoDescription,
      path: pollSeoPath,
      breadcrumbs: [
        { name: SITE_NAME, path: "/" },
        { name: pollMeta.title, path: pollSeoPath },
      ],
    }),
  });

  function clearSession() {
    setAccountAddress(null);
    setPaymentMethod(null);
    setContract(null);
  }

  async function copyShareLink() {
    const url = `${window.location.origin}${pollPath(routePollId)}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareHint("Link copied");
    } catch {
      setShareHint(url);
    }
  }

  async function finishConnect(nextWallet, from, { onCancelCheck } = {}) {
    setBusy(true);
    setStatus({ text: "Registering contracts in wallet…", tone: "neutral" });
    try {
      await registerStandardContracts(nextWallet);
      if (onCancelCheck?.()) return;
      const nextPayment = await getSponsoredPaymentMethod(nextWallet);
      if (onCancelCheck?.()) return;

      if (!contractAddress) {
        setAccountAddress(from);
        setPaymentMethod(nextPayment);
        setStatus({
          text: `Wallet connected · ${shortAddr(from.toString())}. Set contract address env to vote.`,
          tone: "ok",
        });
        return;
      }

      setStatus({ text: "Registering HappyVote in wallet…", tone: "neutral" });
      const nextContract = await registerHappyVote(nextWallet);
      if (onCancelCheck?.()) return;

      setAccountAddress(from);
      setPaymentMethod(nextPayment);
      setContract(nextContract);

      const pol = Number(
        asFieldBigInt(
          await nextContract.methods.get_privacy_policy(pollId).simulate({ from }),
        ),
      );
      if (onCancelCheck?.()) return;
      setPolicy(pol);
      if (pol === PRIVACY.PRIVATE_ONLY) setPrivacyMode("private");
      if (pol === PRIVACY.PUBLIC_ONLY) setPrivacyMode("open");
      await refreshTallies(nextContract, from);
      setStatus({
        text: `Connected · ${shortAddr(from.toString())} · node ${getNodeUrl()}`,
        tone: "ok",
      });
    } finally {
      setBusy(false);
    }
  }

  async function connectSession(importedKeys) {
    walletConnect.reset();
    setBusy(true);
    const onProgress = (text) => setStatus({ text, tone: "neutral" });
    try {
      const proverEnabled = import.meta.env.VITE_PROVER_ENABLED === "true";
      const nextWallet = await createWallet({ proverEnabled, onProgress });
      const { account: nextAccount } = importedKeys
        ? await importAccount(nextWallet, importedKeys, { onProgress })
        : await deployAccount(nextWallet, { onProgress });
      await finishConnect(nextWallet, nextAccount.address);
    } catch (error) {
      console.error(error);
      setStatus({ text: formatConnectError(error), tone: "error" });
      setBusy(false);
    }
  }

  async function refreshTallies(activeContract, from) {
    if (activeContract && from) {
      try {
        const sealedRaw = await activeContract.methods.get_sealed(pollId).simulate({ from });
        const endedRaw = await activeContract.methods.get_vote_ended(pollId).simulate({ from });
        const unwrap = (v) =>
          v && typeof v === "object" && "result" in v ? v.result : v;
        setOnChainSealed(Boolean(unwrap(sealedRaw)));
        setVoteEnded(Boolean(unwrap(endedRaw)));
        try {
          const startsRaw = await activeContract.methods.get_starts_at(pollId).simulate({ from });
          const endsRaw = await activeContract.methods.get_ends_at(pollId).simulate({ from });
          const cancelledRaw = await activeContract.methods.get_cancelled(pollId).simulate({ from });
          setChainStartsAt(Number(asFieldBigInt(startsRaw)));
          setChainEndsAt(Number(asFieldBigInt(endsRaw)));
          setCancelled(Boolean(unwrap(cancelledRaw)));
          if (typeof activeContract.methods.get_paused === "function") {
            const pausedRaw = await activeContract.methods.get_paused().simulate({ from });
            setPaused(Boolean(unwrap(pausedRaw)));
          }
        } catch {
          /* optional views on older deployments */
        }
      } catch {
        /* optional views on older deployments */
      }
      const result = await readTallies(activeContract, pollId, optionLabels.length, from);
      setTallies(result.tallies);
      setTotal(result.total);
      return;
    }
    const result = await readPublicPollState(pollId, optionLabels.length);
    setTallies(result.tallies);
    setTotal(result.total);
    setPolicy(result.policy);
    setOnChainSealed(Boolean(result.sealed ?? pollMeta.sealed));
    if (result.voteEnded != null) setVoteEnded(Boolean(result.voteEnded));
    if (result.cancelled != null) setCancelled(Boolean(result.cancelled));
    if (result.paused != null) setPaused(Boolean(result.paused));
    if (result.startsAt != null) setChainStartsAt(result.startsAt);
    if (result.endsAt != null) setChainEndsAt(result.endsAt);
  }

  function extractTxHash(sendResult) {
    if (!sendResult) return null;
    if (typeof sendResult === "string") return sendResult;
    const hash = sendResult.txHash ?? sendResult.hash;
    if (typeof hash === "string") return hash;
    if (hash && typeof hash.toString === "function") {
      const s = hash.toString();
      if (s && s !== "[object Object]") return s;
    }
    return null;
  }

  async function vote() {
    if (!canVote) return;
    try {
      assertVotingOpen(
        {
          startsAt: unixSecondsToIso(chainStartsAt) || pollMeta.startsAt,
          endsAt: unixSecondsToIso(chainEndsAt) || pollMeta.endsAt,
        },
      );
    } catch (error) {
      setStatus({ text: error.message || String(error), tone: "error" });
      return;
    }
    if (closedOnChain) {
      setStatus({ text: "This poll has ended.", tone: "error" });
      return;
    }
    if (selected < 0 || selected >= optionLabels.length) {
      setStatus({ text: "Invalid option selected.", tone: "error" });
      return;
    }
    setBusy(true);
    setLastTxHash(null);
    setStatus({
      text:
        privacyMode === "private"
          ? "Approve private ballot in your wallet…"
          : "Approve open ballot in your wallet…",
      tone: "neutral",
    });
    try {
      const eligibility =
        pollMeta.eligibilityMode != null
          ? Number(pollMeta.eligibilityMode)
          : requiresZk
            ? ELIGIBILITY_MODE.PERSONHOOD
            : ELIGIBILITY_MODE.OPEN;
      let identityCommitment = new Fr(0);
      if (eligibility !== ELIGIBILITY_MODE.OPEN) {
        if (!zkId) {
          throw new Error("ZKPassport uniqueIdentifier required for this poll");
        }
        identityCommitment = await identityCommitmentFromUid(zkId, Fr);
      }

      const method =
        privacyMode === "private"
          ? contract.methods.cast_vote_private(pollId, new Fr(selected), identityCommitment)
          : contract.methods.cast_vote_open(pollId, new Fr(selected), identityCommitment);

      await method.simulate({ from: accountAddress });
      const receipt = await method.send({
        from: accountAddress,
        fee: { paymentMethod },
        wait: { timeout: 600 },
      });
      const txHash = extractTxHash(receipt);
      if (txHash) setLastTxHash(txHash);
      markVoted(routePollId);
      setVotedReceipt(true);
      await refreshTallies(contract, accountAddress);
      setStatus({
        text: txHash
          ? "Vote recorded · receipt saved in this browser · view on explorer."
          : "Vote recorded · receipt saved in this browser.",
        tone: "ok",
      });
    } catch (error) {
      console.error(error);
      reportClientError({
        message: error?.message || String(error),
        stack: error?.stack,
        pollId: routePollId,
      });
      setStatus({ text: formatVoteError(error), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  function disconnect() {
    walletConnect.disconnectWallet();
    clearSession();
  }

  const faucetHref = FEE_JUICE_FAUCET_URL;
  const resultsHidden =
    (onChainSealed || pollMeta.sealed) &&
    !closedOnChain &&
    schedule.phase !== POLL_PHASE.CLOSED;
  const maxTally = Math.max(1, ...tallies);
  const voteStep = !identityOk ? 1 : !accountAddress ? 2 : 3;

  return (
    <main className="app app-wide">
      <header className="vote-top">
        <nav className="page-nav vote-nav">
          <button type="button" className="btn btn-ghost" onClick={() => navigate(homePath())}>
            ← All polls
          </button>
          <p className="vote-brand-mark" aria-hidden="true">
            HappyVote <span className="brand-on">on</span> <span>Aztec</span>
          </p>
        </nav>

        <div className="vote-hero">
          <p className="vote-kicker">Poll #{routePollId}</p>
          <h1 className="question">{pollMeta.title}</h1>
          {pollMeta.description ? <p className="poll-desc">{pollMeta.description}</p> : null}
          {(pollMeta.topics || []).length > 0 ? (
            <div className="topic-row">
              {pollMeta.topics.map((t) => (
                <span key={t} className="topic-chip">
                  {t}
                </span>
              ))}
            </div>
          ) : null}
          <div className="meta vote-meta">
            <span>
              Network <strong>{getNodeUrl().includes("localhost") ? "local" : "testnet"}</strong>
            </span>
            <span>
              Votes <strong>{total}</strong>
            </span>
            {accountAddress ? (
              <span>
                Account <strong>{shortAddr(accountAddress.toString())}</strong>
              </span>
            ) : null}
            {zkId ? (
              <span>
                Personhood <strong>{shortAddr(zkId)}</strong>
                {zkServerVerified ? " · server OK" : ""}
              </span>
            ) : null}
          </div>
          <PollScheduleBanner schedule={schedule} voteEnded={closedOnChain} />
          <div className="share-row">
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={copyShareLink}>
              Copy share link
            </button>
            {shareHint ? <span className="meta">{shareHint}</span> : null}
            {contractAddressStr ? (
              <a
                className="meta-link"
                href={explorerAddressUrl(contractAddressStr)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Contract on Aztecscan
              </a>
            ) : null}
          </div>
        </div>
      </header>

      <ol className="vote-steps" aria-label="Voting progress">
        <li className={voteStep === 1 ? "is-current" : ""} data-done={identityOk || undefined}>
          {requiresZk ? "Verify" : "Ready"}
        </li>
        <li className={voteStep === 2 ? "is-current" : ""} data-done={Boolean(accountAddress) || undefined}>
          Connect
        </li>
        <li className={voteStep === 3 ? "is-current" : ""}>Vote</li>
      </ol>

      {requiresZk && votingOpen ? (
        <div className="vote-zk">
          <ZkPassportGate
            pollId={routePollId}
            requirements={pollMeta.zkRequirements}
            verifiedId={zkId}
            serverVerified={zkServerVerified}
            onVerified={({ uniqueIdentifier, serverVerified }) => {
              setZkId(uniqueIdentifier);
              setZkServerVerified(Boolean(serverVerified));
              setStatus({
                text: serverVerified
                  ? "Identity verified — connect a wallet and cast your ballot."
                  : "Identity verified for this poll.",
                tone: "ok",
              });
            }}
          />
        </div>
      ) : null}

      <section className="vote-layout" aria-label="Current poll">
        <div className="vote-ballot">
          <h2 className="vote-panel-title">Your ballot</h2>
          <div className="options" role="listbox" aria-label="Options">
            {options.map((option, index) => {
              const count = tallies[index] ?? 0;
              const barPct = Math.round((count / maxTally) * 100);
              return (
                <button
                  key={`${option.label}-${index}`}
                  type="button"
                  className="option"
                  role="option"
                  aria-selected={selected === index}
                  aria-pressed={selected === index}
                  disabled={busy || !votingOpen}
                  onClick={() => setSelected(index)}
                >
                  <span className="option-bar" style={{ width: `${barPct}%` }} aria-hidden="true" />
                  <span className="option-text">
                    <span className="option-label">{option.label}</span>
                    {option.description ? (
                      <span className="option-desc">{option.description}</span>
                    ) : null}
                  </span>
                  <span className="option-count" aria-hidden="true">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {policy === PRIVACY.VOTER_CHOICE ? (
            <fieldset className="privacy">
              <legend>Ballot privacy</legend>
              <div className="privacy-row">
                <button
                  type="button"
                  className="chip"
                  disabled={!votingOpen}
                  aria-pressed={privacyMode === "private"}
                  onClick={() => setPrivacyMode("private")}
                >
                  Private
                </button>
                <button
                  type="button"
                  className="chip"
                  disabled={!votingOpen}
                  aria-pressed={privacyMode === "open"}
                  onClick={() => setPrivacyMode("open")}
                >
                  Open
                </button>
              </div>
            </fieldset>
          ) : (
            <p className="hint">
              Privacy policy:{" "}
              <strong>
                {policy === PRIVACY.PRIVATE_ONLY ? "private only" : "open only"}
              </strong>
            </p>
          )}

          <div className="vote-cta">
            <div className="vote-cta-actions">
              {!votingOpen ? (
                <button type="button" className="btn btn-primary" disabled>
                  {paused
                    ? "Voting paused"
                    : schedule.phase === POLL_PHASE.UPCOMING && !closedOnChain
                    ? `Opens in ${formatCountdown(schedule.remainingMs)}`
                    : "Voting ended"}
                </button>
              ) : !accountAddress ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || !identityOk}
                  onClick={walletConnect.start}
                >
                  Connect Aztec wallet
                </button>
              ) : (
                <button type="button" className="btn btn-primary" disabled={!canVote} onClick={vote}>
                  {busy ? "Working…" : privacyMode === "private" ? "Vote privately" : "Vote openly"}
                </button>
              )}
              {accountAddress ? (
                <button type="button" className="btn btn-ghost" disabled={busy} onClick={disconnect}>
                  Disconnect
                </button>
              ) : null}
              {accountAddress && contract ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => refreshTallies(contract, accountAddress)}
                >
                  Refresh
                </button>
              ) : contractAddress ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => refreshTallies(null, null)}
                >
                  Refresh
                </button>
              ) : null}
            </div>
            {policy === PRIVACY.VOTER_CHOICE ? (
              <p className="hint privacy-hint">
                {privacyMode === "private"
                  ? "Private: your address stays hidden. The network sees a valid +1 to the chosen option, not who you are. Timing/IP can still correlate if few people vote."
                  : "Open: your address and choice are published on-chain."}
              </p>
            ) : null}
            {!votingOpen ? (
              <p className="hint">
                {paused
                  ? "Voting is temporarily paused on this contract."
                  : schedule.phase === POLL_PHASE.UPCOMING && !closedOnChain
                  ? "The poll is published. Connect and vote unlock automatically at the start time."
                  : "This poll is no longer accepting votes."}
              </p>
            ) : !accountAddress && !identityOk ? (
              <p className="hint">
                {requiresZk
                  ? "Verify identity above, then connect a wallet to vote."
                  : "Loading poll…"}
              </p>
            ) : null}
            <p className="status" data-tone={status.tone === "neutral" ? undefined : status.tone}>
              {status.text}
              {lastTxHash ? (
                <>
                  {" "}
                  <a
                    href={explorerTxUrl(lastTxHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open tx
                  </a>
                </>
              ) : null}
            </p>
          </div>
        </div>

        <aside className="vote-results" aria-live="polite">
          <h2 className="vote-panel-title">Live results</h2>
          {votedReceipt ? (
            <p className="hint" data-tone="ok">
              Participation receipt: you voted on this device.
            </p>
          ) : null}
          {resultsHidden ? (
            <p className="vote-results-note">
              {votingOpen
                ? "Tallies are sealed until the poll ends. Votes are still counted on-chain."
                : "Voting has ended. Sealed tallies stay hidden until results are published."}
            </p>
          ) : (
            <>
              <p className="vote-results-total">
                <strong>{total}</strong> votes cast
              </p>
              <div className="tally">
                {optionLabels.map((label, index) => (
                  <div className="tally-row" key={label}>
                    <span>{label}</span>
                    <strong>{tallies[index] ?? 0}</strong>
                    <div className="bar">
                      <i style={{ width: `${((tallies[index] ?? 0) / maxTally) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="vote-results-note">
                Tallies are public. Private mode hides the voter address; open mode publishes it with
                the choice.
              </p>
            </>
          )}
        </aside>
      </section>

      <div className="vote-extras">
        <details className="vote-details">
          <summary>Fees on testnet</summary>
          <p className="fee-hint">
            Testnet uses Sponsored FPC when available. For Fee Juice, claim at{" "}
            <a href={faucetHref} target="_blank" rel="noopener noreferrer">
              aztec-faucet.nethermind.io
            </a>
            {accountAddress ? (
              <>
                {" "}
                (paste <code className="wc-inline-code">{accountAddress.toString()}</code>).
              </>
            ) : (
              "."
            )}
          </p>
        </details>

        <details className="vote-details" id="howto">
          <summary>How to vote</summary>
          <ol className="howto-list">
            <li>
              {requiresZk
                ? "Complete ZKPassport verification for this poll."
                : "Review the options and public tallies."}
            </li>
            <li>
              Click <strong>Connect Aztec wallet</strong>. Prefer <em>Browser session</em> for this
              demo.
            </li>
            <li>Choose an option, pick Private or Open, then vote. First prove can take several minutes.</li>
            <li>
              If fees fail, claim Fee Juice at{" "}
              <a href={faucetHref} target="_blank" rel="noopener noreferrer">
                aztec-faucet.nethermind.io
              </a>
              .
            </li>
          </ol>
        </details>
      </div>

      <SiteFooter
        disclaimer="HappyVote is a technology layer on Aztec Network. It is not an official electoral authority. Private ballots hide your address; open ballots publish your address and selection."
      />

      <WalletConnectModal
        phase={walletConnect.phase}
        pickProvider={walletConnect.pickProvider}
        confirm={walletConnect.confirm}
        reject={walletConnect.reject}
        reset={walletConnect.reset}
        pickAccount={walletConnect.pickAccount}
        beginDiscovery={walletConnect.beginDiscovery}
        beginSession={() => connectSession()}
        beginSessionWithKeys={(keys) => connectSession(keys)}
        allowAdminImport={false}
      />
    </main>
  );
}

function shortAddr(value) {
  if (!value) return "";
  const s = String(value);
  return s.length <= 12 ? s : `${s.slice(0, 6)}…${s.slice(-4)}`;
}

function unwrapAztecAddress(value) {
  if (!value) throw new Error("Missing admin address from get_admin()");
  if (typeof value === "object" && value !== null && "result" in value) {
    return unwrapAztecAddress(value.result);
  }
  if (typeof value.toString === "function") {
    const s = value.toString();
    if (s && s !== "[object Object]") return AztecAddress.fromStringUnsafe(s);
  }
  throw new Error(`Cannot parse admin address: ${value}`);
}

function addressesEqual(a, b) {
  return a.toString().toLowerCase() === b.toString().toLowerCase();
}

function formatConnectError(error) {
  const msg = error?.message || String(error);
  const stack = error?.stack || "";
  if (isBbWasmAbort(msg) || isBbWasmAbort(stack)) {
    return "Aztec prover ran out of memory in this browser (common on iPhone). Close other tabs, retry Browser session, or use a desktop browser.";
  }
  if (/Existing nullifier/i.test(msg)) {
    return `${msg} — admin account is already on-chain; refresh and import keys again (deploy is skipped).`;
  }
  if (/Failed to fetch/i.test(msg)) {
    return `${msg} — check network / adblock, and that CRS CDN (crs.aztec-cdn.foundation) is reachable. Retry Browser session.`;
  }
  if (/authorizeUtilityCall|Cross-contract utility/i.test(msg)) {
    return `${msg} — try “Browser session” instead of Demo Wallet / Azguard for voting.`;
  }
  return msg;
}

function formatVoteError(error) {
  const msg = error?.message || String(error);
  const stack = error?.stack || "";
  if (isBbWasmAbort(msg) || isBbWasmAbort(stack)) {
    return "Aztec prover ran out of memory in this browser (common on iPhone). Close other tabs and retry, or vote from a desktop browser.";
  }
  if (/authorizeUtilityCall|Cross-contract utility/i.test(msg)) {
    return `${msg} — reconnect with “Browser session” (in-page PXE). External wallets need an authorizeUtilityCall hook for HandshakeRegistry.`;
  }
  if (/Identity already voted/i.test(msg)) {
    return "This ZKPassport identity already voted on this poll (one ID → one vote).";
  }
  if (/ZKPassport identity required/i.test(msg)) {
    return "This poll requires ZKPassport — verify identity before voting.";
  }
  if (/Identity not allowed for open polls/i.test(msg)) {
    return "Open-eligibility polls do not accept an identity commitment.";
  }
  if (/Existing nullifier/i.test(msg)) {
    return "You already voted from this account on this poll.";
  }
  return msg;
}
