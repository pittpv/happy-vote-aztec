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
import { parseRoute, navigate, pollsPath } from "./lib/routing.js";
import { ZkPassportGate } from "./components/ZkPassportGate.jsx";
import { WalletConnectModal } from "./components/WalletConnectModal.jsx";
import { AdminCreatePollForm } from "./components/AdminCreatePollForm.jsx";
import { AdminContractControls } from "./components/AdminContractControls.jsx";
import { AdminSiteStats } from "./components/AdminSiteStats.jsx";
import { AdminHomePolls } from "./components/AdminHomePolls.jsx";
import { AdminPanel, AdminTabs, parseAdminTab } from "./components/AdminTabs.jsx";
import { trackPageview } from "./lib/siteStats.js";
import { PollListPage } from "./components/PollListPage.jsx";
import { HomePage } from "./components/HomePage.jsx";
import { SiteHeader } from "./components/SiteHeader.jsx";
import { useWalletConnect } from "./hooks/useWalletConnect.js";
import { useNow } from "./hooks/useNow.js";
import { LegalPage } from "./components/LegalPage.jsx";
import { SiteFooter } from "./components/SiteFooter.jsx";
import { PollScheduleBanner } from "./components/PollScheduleBanner.jsx";
import { identityCommitmentFromUid } from "./lib/zkIdentity.js";
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
import { Notice } from "./components/Notice.jsx";
import { explainError } from "./lib/userMessages.js";
import { shortAddr } from "./lib/format.js";
import {
  VOTE_FREQUENCY,
  isDailyVote,
  msUntilNextUtcDay,
  utcDayIndex,
} from "./lib/voteFrequency.js";

function envRequiresZkPassport() {
  return import.meta.env.VITE_REQUIRE_ZKPASSPORT === "true";
}

export default function App() {
  const [route, setRoute] = useState(() => parseRoute());
  const walletConnect = useWalletConnect();

  useEffect(() => {
    function onPopState() {
      setRoute(parseRoute());
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    trackPageview(window.location.pathname);
  }, [route]);

  if (route.kind === "home") {
    return (
      <>
        <HomePage walletConnect={walletConnect} />
        <AppWalletModal walletConnect={walletConnect} allowAdminImport={false} />
      </>
    );
  }

  if (route.kind === "polls") {
    return (
      <>
        <PollListPage walletConnect={walletConnect} />
        <AppWalletModal walletConnect={walletConnect} allowAdminImport={false} />
      </>
    );
  }

  if (route.kind === "admin") {
    return (
      <>
        <AdminRoute walletConnect={walletConnect} />
        <AppWalletModal walletConnect={walletConnect} allowAdminImport />
      </>
    );
  }

  if (route.kind === "legal") {
    return (
      <>
        <LegalPage slug={route.slug} walletConnect={walletConnect} />
        <AppWalletModal walletConnect={walletConnect} allowAdminImport={false} />
      </>
    );
  }

  return (
    <>
      <PollVoteRoute pollId={route.pollId} walletConnect={walletConnect} />
      <AppWalletModal walletConnect={walletConnect} allowAdminImport={false} />
    </>
  );
}

function AppWalletModal({ walletConnect, allowAdminImport }) {
  async function connectSession(importedKeys) {
    walletConnect.setProgress("Creating browser wallet…");
    const onProgress = (text) => walletConnect.setProgress(text);
    try {
      const proverEnabled = import.meta.env.VITE_PROVER_ENABLED === "true";
      const nextWallet = await createWallet({ proverEnabled, onProgress });
      const { account: nextAccount } = importedKeys
        ? await importAccount(nextWallet, importedKeys, { onProgress })
        : await deployAccount(nextWallet, { onProgress });
      walletConnect.adoptSession(nextWallet, nextAccount.address.toString());
    } catch (error) {
      console.error(error);
      walletConnect.fail(error);
    }
  }

  return (
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
      allowAdminImport={allowAdminImport}
    />
  );
}

function AdminRoute({ walletConnect }) {
  const [status, setStatus] = useState({
    text: "Import admin keys to create polls",
    tone: "neutral",
  });
  const [busy, setBusy] = useState(false);
  const [accountAddress, setAccountAddress] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [contract, setContract] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminTab, setAdminTab] = useState(() => parseAdminTab());
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
          title: ok ? undefined : "Not the contract admin",
          text: ok
            ? `Admin connected · ${shortAddr(from.toString())}`
            : `Connected ${shortAddr(from.toString())} cannot manage polls. Import the deploy admin keys.`,
          tone: ok ? "ok" : "error",
        });
      } catch (error) {
        if (cancelled) return;
        console.error(error);
        setStatus({ tone: "error", ...explainError(error, "connect") });
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

  useEffect(() => {
    function onHash() {
      setAdminTab(parseAdminTab());
    }
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function selectAdminTab(id) {
    setAdminTab(id);
    const next = `${window.location.pathname}${window.location.search}#${id}`;
    window.history.replaceState({}, "", next);
  }

  usePageSeo({
    title: pageTitle("Admin"),
    description: "Import deploy keys and create polls on HappyVote on Aztec.",
    path: "/admin",
    noindex: true,
  });

  return (
    <main className="app app-wide">
      <SiteHeader walletConnect={walletConnect} current="admin" />

      <header className="admin-top">
        <div className="admin-hero">
          <p className="vote-kicker">Operator</p>
          <h1 className="question">Admin</h1>
          <p className="lede">
            {isAdmin
              ? "One section at a time: create a poll, choose homepage polls, review visits, or manage the contract."
              : "Connect the contract admin to create polls, review visits, and manage this instance."}
          </p>
          <div className="admin-hero-row">
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
            {accountAddress ? (
              <span className="admin-pill" data-ok={isAdmin || undefined}>
                {isAdmin ? "Admin" : "Not admin"} · {shortAddr(accountAddress.toString())}
              </span>
            ) : null}
          </div>
          {status.tone === "error" || status.title ? (
            <Notice tone={status.tone} title={status.title}>
              {status.text}
            </Notice>
          ) : (
            <p className="status" data-tone={status.tone === "neutral" ? undefined : status.tone}>
              {status.text}
            </p>
          )}
        </div>
      </header>

      {isAdmin && accountAddress && contract && paymentMethod ? (
        <section className="admin" aria-label="Admin">
          <AdminTabs value={adminTab} onChange={selectAdminTab} />
          <AdminPanel id="create" active={adminTab}>
            <AdminCreatePollForm
              contract={contract}
              accountAddress={accountAddress}
              paymentMethod={paymentMethod}
              busy={busy}
              setBusy={setBusy}
              setStatus={setStatus}
              onCreated={(meta) => navigate(pollPath(meta.id))}
            />
          </AdminPanel>
          <AdminPanel id="home" active={adminTab}>
            <AdminHomePolls
              active={adminTab === "home"}
              busy={busy}
              setBusy={setBusy}
              setStatus={setStatus}
            />
          </AdminPanel>
          <AdminPanel id="visits" active={adminTab}>
            <AdminSiteStats />
          </AdminPanel>
          <AdminPanel id="contract" active={adminTab}>
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
          </AdminPanel>
        </section>
      ) : accountAddress && !isAdmin ? (
        <p className="meta">
          This account is not the HappyVote admin. Import SECRET_KEY / SIGNING_KEY / SALT from{" "}
          <code>aztec/.env</code>.
        </p>
      ) : null}

      <SiteFooter
        disclaimer="HappyVote is a technology layer on Aztec Network. It is not an official electoral authority."
      />
    </main>
  );
}

function PollVoteRoute({ pollId: routePollId, walletConnect }) {
  const [pollMeta, setPollMeta] = useState(() => getPollMeta(routePollId));
  const options = pollMeta.options;
  const optionLabels = pollOptionLabels(options);
  const requiresZk =
    Boolean(pollMeta.requiresZkPassport) || envRequiresZkPassport();

  const [status, setStatus] = useState(() =>
    walletConnect.phase.kind === "connected"
      ? { text: "Restoring wallet session…", tone: "neutral" }
      : { text: "Read-only mode · connect a wallet to vote", tone: "neutral" },
  );
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
  const [voteFrequency, setVoteFrequency] = useState(
    () => Number(getPollMeta(routePollId).voteFrequency) || VOTE_FREQUENCY.ONCE,
  );
  const [receiptNonce, setReceiptNonce] = useState(0);
  const [zkId, setZkId] = useState(null);
  const [zkServerVerified, setZkServerVerified] = useState(false);
  const [shareHint, setShareHint] = useState("");
  const now = useNow(1000);
  const dailyVote = isDailyVote(voteFrequency);
  const votedReceipt = hasVotedReceipt(routePollId, { frequency: voteFrequency, now });
  void receiptNonce;
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
    !votedReceipt &&
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
    setReceiptNonce(0);
    setVoteFrequency(Number(getPollMeta(routePollId).voteFrequency) || VOTE_FREQUENCY.ONCE);
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
        if (result.voteFrequency != null) setVoteFrequency(Number(result.voteFrequency));
        setStatus({
          text:
            walletConnect.phase.kind === "connected"
              ? `Connected · ${shortAddr(String(walletConnect.phase.address))} · this poll`
              : "Public tallies · connect a wallet to vote",
          tone: walletConnect.phase.kind === "connected" ? "ok" : "neutral",
        });
      } catch (error) {
        if (cancelled) return;
        console.error(error);
        setStatus({ tone: "error", ...explainError(error, "generic") });
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
        setStatus({ tone: "error", ...explainError(error, "connect") });
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
        { name: "All polls", path: "/polls" },
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
          if (typeof activeContract.methods.get_vote_frequency === "function") {
            const freqRaw = await activeContract.methods.get_vote_frequency(pollId).simulate({
              from,
            });
            setVoteFrequency(Number(asFieldBigInt(freqRaw)));
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
    if (result.voteFrequency != null) setVoteFrequency(Number(result.voteFrequency));
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
      setStatus({
        title: "Voting not open",
        text: error.message || "This poll is not accepting votes right now.",
        tone: "error",
      });
      return;
    }
    if (closedOnChain) {
      setStatus({
        title: "Voting closed",
        text: "This poll has ended and no longer accepts ballots.",
        tone: "error",
      });
      return;
    }
    if (selected < 0 || selected >= optionLabels.length) {
      setStatus({
        title: "Pick an option",
        text: "Choose one option before casting your ballot.",
        tone: "error",
      });
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

      const period = new Fr(dailyVote ? utcDayIndex() : 0);
      const supportsPeriod = typeof contract.methods.get_vote_frequency === "function";
      const method =
        privacyMode === "private"
          ? supportsPeriod
            ? contract.methods.cast_vote_private(
                pollId,
                new Fr(selected),
                identityCommitment,
                period,
              )
            : contract.methods.cast_vote_private(pollId, new Fr(selected), identityCommitment)
          : supportsPeriod
            ? contract.methods.cast_vote_open(pollId, new Fr(selected), identityCommitment, period)
            : contract.methods.cast_vote_open(pollId, new Fr(selected), identityCommitment);

      await method.simulate({ from: accountAddress });
      const receipt = await method.send({
        from: accountAddress,
        fee: { paymentMethod },
        wait: { timeout: 600 },
      });
      const txHash = extractTxHash(receipt);
      if (txHash) setLastTxHash(txHash);
      markVoted(routePollId, { frequency: voteFrequency });
      setReceiptNonce((n) => n + 1);
      await refreshTallies(contract, accountAddress);
      setStatus({
        title: "Vote recorded",
        text: dailyVote
          ? "You can cast another ballot after 00:00 UTC."
          : "A participation receipt is saved in this browser.",
        tone: "ok",
      });
    } catch (error) {
      console.error(error);
      reportClientError({
        message: error?.message || String(error),
        stack: error?.stack,
        pollId: routePollId,
      });
      const explained = explainError(error, "vote");
      if (explained.code === "already_voted") {
        markVoted(routePollId, { frequency: voteFrequency });
        setReceiptNonce((n) => n + 1);
        setStatus({
          tone: "error",
          title: dailyVote ? "Already voted today" : explained.title,
          text: dailyVote
            ? `You can vote again in ${formatCountdown(msUntilNextUtcDay())}.`
            : explained.text,
        });
      } else {
        setStatus({ tone: "error", ...explained });
      }
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
      <SiteHeader walletConnect={walletConnect} current="poll" />

      <header className="vote-top">
        <nav className="page-nav vote-nav">
          <button type="button" className="btn btn-ghost" onClick={() => navigate(pollsPath())}>
            ← All polls
          </button>
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
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!canVote || votedReceipt}
                  onClick={vote}
                >
                  {busy
                    ? "Working…"
                    : votedReceipt
                      ? dailyVote
                        ? "Already voted today"
                        : "Already voted"
                      : privacyMode === "private"
                        ? "Vote privately"
                        : "Vote openly"}
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
            {dailyVote && votingOpen && !votedReceipt ? (
              <p className="hint">
                One ballot per UTC day (00:00–24:00), private or open. After today you can vote
                again in {formatCountdown(msUntilNextUtcDay(now))}.
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
            {status.tone === "error" || status.title || lastTxHash ? (
              <Notice tone={status.tone === "error" ? "error" : "ok"} title={status.title}>
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
              </Notice>
            ) : votedReceipt ? (
              <Notice tone="ok" title={dailyVote ? "Already voted today" : "Already voted"}>
                {dailyVote
                  ? `You can vote again in ${formatCountdown(msUntilNextUtcDay(now))}.`
                  : "This device already has a participation receipt for this poll. One account can vote once."}
              </Notice>
            ) : (
              <p className="status" data-tone={status.tone === "neutral" ? undefined : status.tone}>
                {status.text}
              </p>
            )}
          </div>
        </div>

        <aside className="vote-results" aria-live="polite">
          <h2 className="vote-panel-title">Live results</h2>
          {votedReceipt ? (
            <p className="hint" data-tone="ok">
              {dailyVote
                ? `Participation receipt: you voted today. Next ballot in ${formatCountdown(msUntilNextUtcDay(now))}.`
                : "Participation receipt: you voted on this device."}
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
    </main>
  );
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
