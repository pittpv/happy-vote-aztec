import { useMemo, useState } from "react";
import {
  defaultZkRequirements,
  describeZkRequirements,
  eligibilityModeFromRequirements,
  hashZkRequirementsToField,
  isGatedRequirements,
  normalizeZkRequirements,
  ELIGIBILITY_MODE,
} from "../lib/zkRequirements.js";
import { DOCUMENT_TYPE_OPTIONS } from "../lib/countries.js";
import { PRIVACY, Fr } from "../lib/aztecClient.js";
import { savePollMeta, publishPollMeta, normalizePollOptions } from "../lib/polls.js";
import { CountryPicker } from "./CountryPicker.jsx";

/**
 * Admin form: create on-chain poll + ZKPassport requirements (Dashboard-like).
 * After create, publishes metadata to the shared catalog (/api/polls) when a publish token is set.
 */
export function AdminCreatePollForm({
  contract,
  accountAddress,
  paymentMethod,
  busy,
  setBusy,
  setStatus,
  onCreated,
}) {
  const [pollIdInput, setPollIdInput] = useState("3");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [topicsText, setTopicsText] = useState("governance");
  const [optionRows, setOptionRows] = useState([
    { label: "Yes", description: "" },
    { label: "No", description: "" },
    { label: "Abstain", description: "" },
  ]);
  const [important, setImportant] = useState(true);
  const [sealed, setSealed] = useState(false);
  const [publishToken, setPublishToken] = useState(
    () =>
      (typeof sessionStorage !== "undefined" && sessionStorage.getItem("happyvote.publishToken")) ||
      import.meta.env.VITE_POLLS_PUBLISH_TOKEN ||
      "",
  );

  const [purpose, setPurpose] = useState(
    "Prove you meet this poll’s eligibility rules to cast a ballot",
  );
  const [policyId, setPolicyId] = useState("");

  // Age & birthdate
  const [useMinAge, setUseMinAge] = useState(false);
  const [minAge, setMinAge] = useState("18");
  const [useMaxAge, setUseMaxAge] = useState(false);
  const [maxAge, setMaxAge] = useState("120");
  const [useBornAfter, setUseBornAfter] = useState(false);
  const [bornAfter, setBornAfter] = useState("");
  const [useBornBefore, setUseBornBefore] = useState(false);
  const [bornBefore, setBornBefore] = useState("");

  // Nationality
  const [useNatIn, setUseNatIn] = useState(false);
  const [nationalityIn, setNationalityIn] = useState([]);
  const [useNatOut, setUseNatOut] = useState(false);
  const [nationalityOut, setNationalityOut] = useState([]);

  // Document
  const [useDocType, setUseDocType] = useState(false);
  const [documentTypes, setDocumentTypes] = useState([]);
  const [useExpiresAfter, setUseExpiresAfter] = useState(false);
  const [expiresAfter, setExpiresAfter] = useState("");
  const [useExpiresBefore, setUseExpiresBefore] = useState(false);
  const [expiresBefore, setExpiresBefore] = useState("");
  const [useIssuedBy, setUseIssuedBy] = useState(false);
  const [issuedBy, setIssuedBy] = useState([]);
  const [useNotIssuedBy, setUseNotIssuedBy] = useState(false);
  const [notIssuedBy, setNotIssuedBy] = useState([]);

  // Security
  const [sanctions, setSanctions] = useState(false);
  const [facematchStrict, setFacematchStrict] = useState(false);

  const [openAge, setOpenAge] = useState(true);
  const [openNat, setOpenNat] = useState(true);
  const [openDoc, setOpenDoc] = useState(true);
  const [openSec, setOpenSec] = useState(true);
  const [openPolicy, setOpenPolicy] = useState(false);

  const policyLocks = Boolean(policyId.trim());

  const draftRequirements = useMemo(() => {
    if (!important) return null;
    return {
      personhood: true,
      minAge: useMinAge ? minAge : null,
      maxAge: useMaxAge ? maxAge : null,
      bornAfter: useBornAfter ? bornAfter : null,
      bornBefore: useBornBefore ? bornBefore : null,
      nationalityIn: useNatIn ? nationalityIn : [],
      nationalityOut: useNatOut ? nationalityOut : [],
      documentTypes: useDocType ? documentTypes : [],
      expiresAfter: useExpiresAfter ? expiresAfter : null,
      expiresBefore: useExpiresBefore ? expiresBefore : null,
      issuedBy: useIssuedBy ? issuedBy : [],
      notIssuedBy: useNotIssuedBy ? notIssuedBy : [],
      sanctions,
      facematchStrict,
      policyId: policyId.trim() || null,
      purpose,
    };
  }, [
    important,
    useMinAge,
    minAge,
    useMaxAge,
    maxAge,
    useBornAfter,
    bornAfter,
    useBornBefore,
    bornBefore,
    useNatIn,
    nationalityIn,
    useNatOut,
    nationalityOut,
    useDocType,
    documentTypes,
    useExpiresAfter,
    expiresAfter,
    useExpiresBefore,
    expiresBefore,
    useIssuedBy,
    issuedBy,
    useNotIssuedBy,
    notIssuedBy,
    sanctions,
    facematchStrict,
    policyId,
    purpose,
  ]);

  const previewLines = useMemo(() => {
    if (!important) return ["Open eligibility (any Aztec account; one vote per account)."];
    try {
      return describeZkRequirements(draftRequirements);
    } catch (error) {
      return [`Invalid: ${error.message}`];
    }
  }, [important, draftRequirements]);

  const eligibilityMode = important
    ? eligibilityModeFromRequirements(draftRequirements ?? defaultZkRequirements())
    : ELIGIBILITY_MODE.OPEN;

  function toggleDoc(id) {
    setDocumentTypes((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      // SDK: one type per query
      return [id];
    });
  }

  async function submit(event) {
    event.preventDefault();
    if (!contract || !accountAddress || !paymentMethod) {
      throw new Error("Connect the admin wallet before creating a poll");
    }

    const pollIdNum = Number(pollIdInput);
    if (!Number.isInteger(pollIdNum) || pollIdNum < 1) {
      setStatus({ text: "Poll id must be a positive integer.", tone: "error" });
      return;
    }

    const options = normalizePollOptions(optionRows);
    if (options.length < 2) {
      setStatus({ text: "Need at least two options with labels.", tone: "error" });
      return;
    }
    if (options.length > 32) {
      setStatus({ text: "At most 32 options.", tone: "error" });
      return;
    }
    if (!title.trim()) {
      setStatus({ text: "Title is required.", tone: "error" });
      return;
    }

    const topics = topicsText
      .split(/[,#\n]/)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 8);

    let requirements = null;
    let metadataHash = new Fr(pollIdNum);
    try {
      if (important) {
        requirements = normalizeZkRequirements(draftRequirements);
        metadataHash = await hashZkRequirementsToField(requirements, Fr);
      }
    } catch (error) {
      setStatus({ text: error.message || String(error), tone: "error" });
      return;
    }

    setBusy(true);
    setStatus({
      text: `Creating poll #${pollIdNum} (eligibility ${eligibilityLabel(eligibilityMode)})…`,
      tone: "neutral",
    });
    try {
      const pollId = { id: Fr.fromString(String(pollIdNum)) };
      await contract.methods
        .create_poll(
          pollId,
          options.length,
          PRIVACY.VOTER_CHOICE,
          eligibilityMode,
          metadataHash,
          sealed,
        )
        .send({
          from: accountAddress,
          fee: { paymentMethod },
          wait: { timeout: 600 },
        });

      const meta = {
        id: String(pollIdNum),
        title: title.trim(),
        description: description.trim() || undefined,
        topics,
        options,
        template: options.length === 2 ? "binary" : "single_choice",
        requiresZkPassport: important,
        eligibilityMode,
        zkRequirements: requirements,
        sealed,
        metadataHash: metadataHash.toString(),
      };
      savePollMeta(meta);

      if (publishToken) {
        try {
          sessionStorage.setItem("happyvote.publishToken", publishToken);
        } catch {
          /* ignore */
        }
        setStatus({ text: "Publishing metadata to shared catalog…", tone: "neutral" });
        const published = await publishPollMeta(meta, publishToken);
        if (published.persisted) {
          setStatus({
            text: `Poll #${pollIdNum} created and published for all users.`,
            tone: "ok",
          });
        } else {
          setStatus({
            text: `Poll #${pollIdNum} created on-chain, but catalog publish failed: ${published.error || "unknown"}. Local only until Blob/token is configured.`,
            tone: "error",
          });
        }
      } else {
        setStatus({
          text: `Poll #${pollIdNum} created locally. Add a publish token to share labels/ZK rules with everyone.`,
          tone: "ok",
        });
      }
      onCreated?.(meta);
    } catch (error) {
      console.error(error);
      setStatus({ text: error?.message || String(error), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="admin-form" onSubmit={submit}>
      <h2>Create poll</h2>
      <p className="meta">
        On-chain: options count, privacy, eligibility, sealed flag, metadata hash. Labels and
        ZKPassport rules are published to the shared catalog when a publish token is set.
      </p>

      <label>
        Poll id
        <input
          type="number"
          min={1}
          step={1}
          value={pollIdInput}
          disabled={busy}
          onChange={(e) => setPollIdInput(e.target.value)}
          required
        />
      </label>

      <label>
        Title
        <input
          type="text"
          value={title}
          disabled={busy}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Should we adopt proposal X?"
          required
        />
      </label>

      <label>
        Description
        <input
          type="text"
          value={description}
          disabled={busy}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional short context"
        />
      </label>

      <label>
        Topics (comma-separated)
        <input
          type="text"
          value={topicsText}
          disabled={busy}
          onChange={(e) => setTopicsText(e.target.value)}
          placeholder="governance, elections, demo"
        />
      </label>

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
                onChange={(e) => {
                  const next = [...optionRows];
                  next[index] = { ...next[index], label: e.target.value };
                  setOptionRows(next);
                }}
                placeholder={`Option ${index + 1}`}
                required
              />
            </label>
            <label>
              Description
              <input
                type="text"
                value={row.description}
                disabled={busy}
                onChange={(e) => {
                  const next = [...optionRows];
                  next[index] = { ...next[index], description: e.target.value };
                  setOptionRows(next);
                }}
                placeholder="Optional short explanation"
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
        <legend>Voter eligibility</legend>
        <label className="check-row">
          <input
            type="checkbox"
            checked={important}
            disabled={busy}
            onChange={(e) => setImportant(e.target.checked)}
          />
          Important poll — require ZKPassport
        </label>

        <label className="check-row">
          <input
            type="checkbox"
            checked={sealed}
            disabled={busy}
            onChange={(e) => setSealed(e.target.checked)}
          />
          Sealed tallies — hide results until the poll ends
        </label>

        <label>
          Catalog publish token
          <input
            type="password"
            autoComplete="off"
            value={publishToken}
            disabled={busy}
            onChange={(e) => setPublishToken(e.target.value)}
            placeholder="POLLS_PUBLISH_TOKEN (needed so everyone sees this poll)"
          />
        </label>

        {important ? (
          <>
            <label>
              Purpose shown in ZKPassport
              <input
                type="text"
                value={purpose}
                disabled={busy}
                onChange={(e) => setPurpose(e.target.value)}
              />
            </label>

            <p className="meta">
              Configure checks like the ZKPassport Dashboard. Optional Dashboard policy id overrides
              these fields when set.
            </p>

            <PolicySection
              title="Age & Birthdate"
              open={openAge}
              onToggle={() => setOpenAge((v) => !v)}
              disabled={busy || policyLocks}
            >
              <RuleRow
                enabled={useMinAge}
                onEnabled={setUseMinAge}
                title="Minimum Age"
                hint="User must be at least this old"
                disabled={busy || policyLocks}
              >
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={minAge}
                  disabled={busy || policyLocks || !useMinAge}
                  onChange={(e) => setMinAge(e.target.value)}
                />
              </RuleRow>
              <RuleRow
                enabled={useMaxAge}
                onEnabled={setUseMaxAge}
                title="Maximum Age"
                hint="User must be no older than this"
                disabled={busy || policyLocks}
              >
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={maxAge}
                  disabled={busy || policyLocks || !useMaxAge}
                  onChange={(e) => setMaxAge(e.target.value)}
                />
              </RuleRow>
              <RuleRow
                enabled={useBornAfter}
                onEnabled={setUseBornAfter}
                title="Born After"
                hint="User must be born on or after this date"
                disabled={busy || policyLocks}
              >
                <input
                  type="date"
                  value={bornAfter}
                  disabled={busy || policyLocks || !useBornAfter}
                  onChange={(e) => setBornAfter(e.target.value)}
                />
              </RuleRow>
              <RuleRow
                enabled={useBornBefore}
                onEnabled={setUseBornBefore}
                title="Born Before"
                hint="User must be born on or before this date"
                disabled={busy || policyLocks}
              >
                <input
                  type="date"
                  value={bornBefore}
                  disabled={busy || policyLocks || !useBornBefore}
                  onChange={(e) => setBornBefore(e.target.value)}
                />
              </RuleRow>
            </PolicySection>

            <PolicySection
              title="Nationality"
              open={openNat}
              onToggle={() => setOpenNat((v) => !v)}
              disabled={busy || policyLocks}
            >
              <RuleRow
                enabled={useNatIn}
                onEnabled={setUseNatIn}
                title="Nationality Inclusion"
                hint="Verify nationality is in list"
                disabled={busy || policyLocks}
              >
                <CountryPicker
                  label="Nationality Inclusion"
                  hint="Verification succeeds only if nationality is one of the selected countries."
                  value={nationalityIn}
                  exclude={nationalityOut}
                  disabled={busy || policyLocks || !useNatIn}
                  onChange={setNationalityIn}
                />
              </RuleRow>
              <RuleRow
                enabled={useNatOut}
                onEnabled={setUseNatOut}
                title="Nationality Exclusion"
                hint="Verify nationality is not in list"
                disabled={busy || policyLocks}
              >
                <CountryPicker
                  label="Nationality Exclusion"
                  hint="Verification fails if nationality is one of the selected countries."
                  value={nationalityOut}
                  exclude={nationalityIn}
                  disabled={busy || policyLocks || !useNatOut}
                  onChange={setNationalityOut}
                />
              </RuleRow>
            </PolicySection>

            <PolicySection
              title="Document Type & Expiration"
              open={openDoc}
              onToggle={() => setOpenDoc((v) => !v)}
              disabled={busy || policyLocks}
            >
              <RuleRow
                enabled={useDocType}
                onEnabled={setUseDocType}
                title="Document Type"
                hint="Accept only a specific document type (SDK: one type)"
                disabled={busy || policyLocks}
              >
                <div className="doc-type-list">
                  {DOCUMENT_TYPE_OPTIONS.map((d) => (
                    <label key={d.id} className="check-row compact">
                      <input
                        type="checkbox"
                        checked={documentTypes.includes(d.id)}
                        disabled={busy || policyLocks || !useDocType}
                        onChange={() => toggleDoc(d.id)}
                      />
                      {d.label}
                    </label>
                  ))}
                </div>
              </RuleRow>
              <RuleRow
                enabled={useExpiresAfter}
                onEnabled={setUseExpiresAfter}
                title="Expires After"
                hint="Reject documents that expire before this date"
                disabled={busy || policyLocks}
              >
                <input
                  type="date"
                  value={expiresAfter}
                  disabled={busy || policyLocks || !useExpiresAfter}
                  onChange={(e) => setExpiresAfter(e.target.value)}
                />
              </RuleRow>
              <RuleRow
                enabled={useExpiresBefore}
                onEnabled={setUseExpiresBefore}
                title="Expires Before"
                hint="Document must expire on or before this date"
                disabled={busy || policyLocks}
              >
                <input
                  type="date"
                  value={expiresBefore}
                  disabled={busy || policyLocks || !useExpiresBefore}
                  onChange={(e) => setExpiresBefore(e.target.value)}
                />
              </RuleRow>
              <RuleRow
                enabled={useIssuedBy}
                onEnabled={setUseIssuedBy}
                title="Issued By"
                hint="Document must be issued by one of these countries"
                disabled={busy || policyLocks}
              >
                <CountryPicker
                  label="Issued By"
                  hint="Verification succeeds only if the issuing country is selected."
                  value={issuedBy}
                  exclude={notIssuedBy}
                  disabled={busy || policyLocks || !useIssuedBy}
                  onChange={setIssuedBy}
                />
              </RuleRow>
              <RuleRow
                enabled={useNotIssuedBy}
                onEnabled={setUseNotIssuedBy}
                title="Not Issued By"
                hint="Reject documents issued by these countries"
                disabled={busy || policyLocks}
              >
                <CountryPicker
                  label="Not Issued By"
                  hint="Reject documents issued by the selected countries."
                  value={notIssuedBy}
                  exclude={issuedBy}
                  disabled={busy || policyLocks || !useNotIssuedBy}
                  onChange={setNotIssuedBy}
                />
              </RuleRow>
            </PolicySection>

            <PolicySection
              title="Security checks"
              open={openSec}
              onToggle={() => setOpenSec((v) => !v)}
              disabled={busy || policyLocks}
            >
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={sanctions}
                  disabled={busy || policyLocks}
                  onChange={(e) => setSanctions(e.target.checked)}
                />
                <span>
                  <strong>Sanctions Check</strong>
                  <span className="rule-hint">Verify user is not on sanction lists</span>
                </span>
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={facematchStrict}
                  disabled={busy || policyLocks}
                  onChange={(e) => setFacematchStrict(e.target.checked)}
                />
                <span>
                  <strong>FaceMatch strict</strong>
                  <span className="rule-hint">Stronger liveness / salted personhood</span>
                </span>
              </label>
            </PolicySection>

            <PolicySection
              title="Dashboard policy (optional)"
              open={openPolicy}
              onToggle={() => setOpenPolicy((v) => !v)}
            >
              <label>
                Policy id
                <input
                  type="text"
                  value={policyId}
                  disabled={busy}
                  placeholder="pol_… or leave empty to use checks above"
                  onChange={(e) => setPolicyId(e.target.value)}
                />
              </label>
              {policyLocks ? (
                <p className="meta">
                  Policy id locks the query — age / nationality / document rows above are ignored
                  until you clear it.
                </p>
              ) : null}
            </PolicySection>

            <p className="meta">
              Mode on-chain:{" "}
              <strong>
                {eligibilityMode === ELIGIBILITY_MODE.GATED ? "gated" : "personhood"}
                {draftRequirements && isGatedRequirements(draftRequirements)
                  ? " (predicates set)"
                  : ""}
              </strong>
            </p>
          </>
        ) : null}

        <ul className="req-preview">
          {previewLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </fieldset>

      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? "Working…" : "Create poll on-chain"}
      </button>
    </form>
  );
}

function PolicySection({ title, open, onToggle, children, disabled }) {
  return (
    <div className={`policy-section${disabled ? " is-disabled" : ""}`}>
      <button type="button" className="policy-section-head" onClick={onToggle}>
        <span className="policy-chevron" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
        {title}
      </button>
      {open ? <div className="policy-section-body">{children}</div> : null}
    </div>
  );
}

function RuleRow({ enabled, onEnabled, title, hint, disabled, children }) {
  return (
    <div className={`rule-row${enabled ? " is-on" : ""}`}>
      <label className="check-row rule-toggle">
        <input
          type="checkbox"
          checked={enabled}
          disabled={disabled}
          onChange={(e) => onEnabled(e.target.checked)}
        />
        <span>
          <strong>{title}</strong>
          <span className="rule-hint">{hint}</span>
        </span>
      </label>
      <div className="rule-control">{children}</div>
    </div>
  );
}

function eligibilityLabel(mode) {
  if (mode === ELIGIBILITY_MODE.GATED) return "gated";
  if (mode === ELIGIBILITY_MODE.PERSONHOOD) return "personhood";
  return "open";
}
