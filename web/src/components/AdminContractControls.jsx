import { useEffect, useState } from "react";
import { AztecAddress, Fr, asFieldBigInt } from "../lib/aztecClient.js";

function unwrapBool(value) {
  const inner =
    value && typeof value === "object" && "result" in value ? value.result : value;
  if (typeof inner === "boolean") return inner;
  return asFieldBigInt(inner) !== 0n;
}

/**
 * Contract-admin actions: pause, transfer, end/cancel a poll.
 */
export function AdminContractControls({
  contract,
  accountAddress,
  paymentMethod,
  busy,
  setBusy,
  setStatus,
  onAdminTransferred,
}) {
  const [paused, setPaused] = useState(false);
  const [successor, setSuccessor] = useState("");
  const [confirmTransfer, setConfirmTransfer] = useState(false);
  const [pollIdInput, setPollIdInput] = useState("");

  useEffect(() => {
    if (!contract || !accountAddress) return;
    let cancelled = false;
    (async () => {
      const raw = await contract.methods.get_paused().simulate({ from: accountAddress });
      if (!cancelled) setPaused(unwrapBool(raw));
    })().catch((error) => {
      if (cancelled) return;
      setStatus({
        text: `Could not read paused: ${error?.message || String(error)}`,
        tone: "error",
      });
    });
    return () => {
      cancelled = true;
    };
  }, [contract, accountAddress, setStatus]);

  async function send(label, method) {
    if (!contract || !accountAddress || !paymentMethod) {
      throw new Error("Connect the admin wallet first");
    }
    setBusy(true);
    setStatus({ text: `${label}…`, tone: "neutral" });
    try {
      await method.send({
        from: accountAddress,
        fee: { paymentMethod },
        wait: { timeout: 600 },
      });
      setStatus({ text: `${label} confirmed.`, tone: "ok" });
    } catch (error) {
      console.error(error);
      setStatus({ text: error?.message || String(error), tone: "error" });
      throw error;
    } finally {
      setBusy(false);
    }
  }

  async function togglePause() {
    const next = !paused;
    try {
      await send(next ? "Pausing contract" : "Unpausing contract", contract.methods.set_paused(next));
      setPaused(next);
    } catch {
      /* status already set */
    }
  }

  async function transfer() {
    const raw = successor.trim();
    if (!raw) {
      setStatus({ text: "Successor Aztec address is required.", tone: "error" });
      return;
    }
    if (!confirmTransfer) {
      setStatus({ text: "Confirm transfer before sending.", tone: "error" });
      return;
    }
    let nextAdmin;
    try {
      nextAdmin = AztecAddress.fromStringUnsafe(raw);
    } catch (error) {
      setStatus({ text: error?.message || "Invalid Aztec address.", tone: "error" });
      return;
    }
    if (/^0+$/.test(nextAdmin.toString().replace(/^0x/i, ""))) {
      setStatus({ text: "Successor must be a non-zero Aztec address.", tone: "error" });
      return;
    }
    try {
      await send("Transferring admin", contract.methods.transfer_admin(nextAdmin));
      setSuccessor("");
      setConfirmTransfer(false);
      onAdminTransferred?.(nextAdmin);
    } catch {
      /* status already set */
    }
  }

  function parsePollId() {
    const pollIdNum = Number(pollIdInput);
    if (!Number.isInteger(pollIdNum) || pollIdNum < 1) {
      setStatus({ text: "Poll id must be a positive integer.", tone: "error" });
      return null;
    }
    return { id: Fr.fromString(String(pollIdNum)) };
  }

  async function endPoll() {
    const pollId = parsePollId();
    if (!pollId) return;
    try {
      await send(`Ending poll #${pollIdInput}`, contract.methods.end_poll(pollId));
    } catch {
      /* status already set */
    }
  }

  async function cancelPoll() {
    const pollId = parsePollId();
    if (!pollId) return;
    try {
      await send(`Cancelling poll #${pollIdInput}`, contract.methods.cancel_poll(pollId));
    } catch {
      /* status already set */
    }
  }

  return (
    <section className="admin-form admin-controls">
      <h2>Contract controls</h2>
      <p className="meta">
        Pause blocks create and vote. Transfer is immediate — only the successor can undo it.
        Cancel works only if the poll has zero votes.
      </p>

      <div className="admin-controls-row">
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={togglePause}>
          {paused ? "Unpause voting" : "Pause voting"}
        </button>
        <span className="hint">{paused ? "Contract is paused." : "Contract is live."}</span>
      </div>

      <label>
        New admin (Aztec address)
        <input
          type="text"
          value={successor}
          disabled={busy}
          onChange={(e) => setSuccessor(e.target.value)}
          placeholder="0x…"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <label className="admin-confirm">
        <input
          type="checkbox"
          checked={confirmTransfer}
          disabled={busy}
          onChange={(e) => setConfirmTransfer(e.target.checked)}
        />
        I understand transfer is immediate and irreversible unless the successor transfers back.
      </label>
      <button type="button" className="btn btn-ghost" disabled={busy} onClick={transfer}>
        Transfer admin
      </button>

      <label>
        Poll id
        <input
          type="number"
          min={1}
          step={1}
          value={pollIdInput}
          disabled={busy}
          onChange={(e) => setPollIdInput(e.target.value)}
          placeholder="e.g. 4"
        />
      </label>
      <div className="admin-controls-row">
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={endPoll}>
          End poll
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={cancelPoll}>
          Cancel poll
        </button>
      </div>
    </section>
  );
}
