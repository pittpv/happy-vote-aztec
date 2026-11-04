import { useEffect, useMemo, useState } from "react";
import { DOCUMENT_TYPE_OPTIONS } from "../lib/countries.js";
import { describeZkRequirements } from "../lib/zkRequirements.js";
import { CountryPicker } from "./CountryPicker.jsx";

/**
 * Personhood plus the checks a user poll can sign.
 * Dashboard policy id is not part of this editor.
 */
export function ZkRequirementsFields({ disabled, onChange }) {
  const [enabled, setEnabled] = useState(false);
  const [purpose, setPurpose] = useState("Prove eligibility to vote on HappyVote on Aztec");
  const [openAge, setOpenAge] = useState(false);
  const [useMinAge, setUseMinAge] = useState(false);
  const [minAge, setMinAge] = useState("18");
  const [useMaxAge, setUseMaxAge] = useState(false);
  const [maxAge, setMaxAge] = useState("99");
  const [useBornAfter, setUseBornAfter] = useState(false);
  const [bornAfter, setBornAfter] = useState("");
  const [useBornBefore, setUseBornBefore] = useState(false);
  const [bornBefore, setBornBefore] = useState("");
  const [openNat, setOpenNat] = useState(false);
  const [useNatIn, setUseNatIn] = useState(false);
  const [nationalityIn, setNationalityIn] = useState([]);
  const [useNatOut, setUseNatOut] = useState(false);
  const [nationalityOut, setNationalityOut] = useState([]);
  const [openDoc, setOpenDoc] = useState(false);
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
  const [openSec, setOpenSec] = useState(false);
  const [sanctions, setSanctions] = useState(false);
  const [facematchStrict, setFacematchStrict] = useState(false);

  const draft = useMemo(() => {
    if (!enabled) return null;
    return {
      personhood: true,
      purpose,
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
    };
  }, [
    enabled,
    purpose,
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
  ]);

  useEffect(() => {
    onChange(draft);
  }, [draft, onChange]);

  const preview = useMemo(() => {
    if (!draft) return ["Any Aztec account can ballot."];
    try {
      return describeZkRequirements(draft);
    } catch (error) {
      return [error.message];
    }
  }, [draft]);

  function toggleDoc(id) {
    setDocumentTypes((prev) => (prev.includes(id) ? [] : [id]));
  }

  return (
    <fieldset className="zk-req">
      <legend>Voter eligibility</legend>
      <label className="check-row">
        <input
          type="checkbox"
          checked={enabled}
          disabled={disabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        Important poll — require ZKPassport
      </label>
      <p className="meta">
        {enabled
          ? "Personhood is always required. Extra checks are signed with the listing and checked again before a ballot unlocks."
          : "Any Aztec account can ballot. Turn this on to require ZKPassport."}
      </p>

      {enabled ? (
        <>
          <label>
            Purpose shown in ZKPassport
            <input
              type="text"
              value={purpose}
              disabled={disabled}
              maxLength={280}
              onChange={(event) => setPurpose(event.target.value)}
            />
          </label>

          <PolicySection title="Age & Birthdate" open={openAge} onToggle={() => setOpenAge((v) => !v)} disabled={disabled}>
            <RuleRow enabled={useMinAge} onEnabled={setUseMinAge} title="Minimum Age" hint="User must be at least this old" disabled={disabled}>
              <input type="number" min={1} max={99} value={minAge} disabled={disabled || !useMinAge} onChange={(event) => setMinAge(event.target.value)} />
            </RuleRow>
            <RuleRow enabled={useMaxAge} onEnabled={setUseMaxAge} title="Maximum Age" hint="User must be no older than this" disabled={disabled}>
              <input type="number" min={1} max={99} value={maxAge} disabled={disabled || !useMaxAge} onChange={(event) => setMaxAge(event.target.value)} />
            </RuleRow>
            <RuleRow enabled={useBornAfter} onEnabled={setUseBornAfter} title="Born After" hint="User must be born on or after this date" disabled={disabled}>
              <input type="date" value={bornAfter} disabled={disabled || !useBornAfter} onChange={(event) => setBornAfter(event.target.value)} />
            </RuleRow>
            <RuleRow enabled={useBornBefore} onEnabled={setUseBornBefore} title="Born Before" hint="User must be born on or before this date" disabled={disabled}>
              <input type="date" value={bornBefore} disabled={disabled || !useBornBefore} onChange={(event) => setBornBefore(event.target.value)} />
            </RuleRow>
          </PolicySection>

          <PolicySection title="Nationality" open={openNat} onToggle={() => setOpenNat((v) => !v)} disabled={disabled}>
            <RuleRow enabled={useNatIn} onEnabled={setUseNatIn} title="Nationality Inclusion" hint="Verify nationality is in list" disabled={disabled}>
              <CountryPicker label="Nationality Inclusion" hint="Verification succeeds only if nationality is one of the selected countries." value={nationalityIn} exclude={nationalityOut} disabled={disabled || !useNatIn} onChange={setNationalityIn} />
            </RuleRow>
            <RuleRow enabled={useNatOut} onEnabled={setUseNatOut} title="Nationality Exclusion" hint="Verify nationality is not in list" disabled={disabled}>
              <CountryPicker label="Nationality Exclusion" hint="Verification fails if nationality is one of the selected countries." value={nationalityOut} exclude={nationalityIn} disabled={disabled || !useNatOut} onChange={setNationalityOut} />
            </RuleRow>
          </PolicySection>

          <PolicySection title="Document Type & Expiration" open={openDoc} onToggle={() => setOpenDoc((v) => !v)} disabled={disabled}>
            <RuleRow enabled={useDocType} onEnabled={setUseDocType} title="Document Type" hint="Accept only one document type" disabled={disabled}>
              <div className="doc-type-list">
                {DOCUMENT_TYPE_OPTIONS.map((doc) => (
                  <label key={doc.id} className="check-row compact">
                    <input type="checkbox" checked={documentTypes.includes(doc.id)} disabled={disabled || !useDocType} onChange={() => toggleDoc(doc.id)} />
                    {doc.label}
                  </label>
                ))}
              </div>
            </RuleRow>
            <RuleRow enabled={useExpiresAfter} onEnabled={setUseExpiresAfter} title="Expires After" hint="Reject documents that expire before this date" disabled={disabled}>
              <input type="date" value={expiresAfter} disabled={disabled || !useExpiresAfter} onChange={(event) => setExpiresAfter(event.target.value)} />
            </RuleRow>
            <RuleRow enabled={useExpiresBefore} onEnabled={setUseExpiresBefore} title="Expires Before" hint="Document must expire on or before this date" disabled={disabled}>
              <input type="date" value={expiresBefore} disabled={disabled || !useExpiresBefore} onChange={(event) => setExpiresBefore(event.target.value)} />
            </RuleRow>
            <RuleRow enabled={useIssuedBy} onEnabled={setUseIssuedBy} title="Issued By" hint="Document must be issued by one of these countries" disabled={disabled}>
              <CountryPicker label="Issued By" hint="Verification succeeds only if the issuing country is selected." value={issuedBy} exclude={notIssuedBy} disabled={disabled || !useIssuedBy} onChange={setIssuedBy} />
            </RuleRow>
            <RuleRow enabled={useNotIssuedBy} onEnabled={setUseNotIssuedBy} title="Not Issued By" hint="Reject documents issued by these countries" disabled={disabled}>
              <CountryPicker label="Not Issued By" hint="Reject documents issued by the selected countries." value={notIssuedBy} exclude={issuedBy} disabled={disabled || !useNotIssuedBy} onChange={setNotIssuedBy} />
            </RuleRow>
          </PolicySection>

          <PolicySection title="Security checks" open={openSec} onToggle={() => setOpenSec((v) => !v)} disabled={disabled}>
            <label className="check-row">
              <input type="checkbox" checked={sanctions} disabled={disabled} onChange={(event) => setSanctions(event.target.checked)} />
              <span>
                <strong>Sanctions Check</strong>
                <span className="rule-hint">Verify user is not on sanction lists</span>
              </span>
            </label>
            <label className="check-row">
              <input type="checkbox" checked={facematchStrict} disabled={disabled} onChange={(event) => setFacematchStrict(event.target.checked)} />
              <span>
                <strong>FaceMatch strict</strong>
                <span className="rule-hint">Stronger liveness check</span>
              </span>
            </label>
          </PolicySection>

          <ul className="req-preview">
            {preview.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      ) : null}
    </fieldset>
  );
}

function PolicySection({ title, open, onToggle, children, disabled }) {
  return (
    <div className={`policy-section${disabled ? " is-disabled" : ""}`}>
      <button type="button" className="policy-section-head" onClick={onToggle} disabled={disabled}>
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
        <input type="checkbox" checked={enabled} disabled={disabled} onChange={(event) => onEnabled(event.target.checked)} />
        <span>
          <strong>{title}</strong>
          <span className="rule-hint">{hint}</span>
        </span>
      </label>
      <div className="rule-control">{children}</div>
    </div>
  );
}
