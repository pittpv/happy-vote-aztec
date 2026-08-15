const TABS = [
  { id: "create", label: "Create poll", description: "New poll and eligibility" },
  { id: "home", label: "Homepage", description: "Featured poll cards" },
  { id: "visits", label: "Visits", description: "Cookieless site totals" },
  { id: "contract", label: "Contract", description: "Pause, end, transfer" },
];

const TAB_IDS = TABS.map((tab) => tab.id);

export function parseAdminTab(hash = window.location.hash) {
  const id = String(hash || "").replace(/^#/, "");
  return TAB_IDS.includes(id) ? id : "create";
}

export function AdminTabs({ value, onChange }) {
  return (
    <div className="admin-tabs" role="tablist" aria-label="Admin sections">
      {TABS.map((tab) => {
        const selected = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`admin-tab-${tab.id}`}
            className="admin-tab"
            aria-selected={selected}
            aria-controls={`admin-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
          >
            <span className="admin-tab-label">{tab.label}</span>
            <span className="admin-tab-desc">{tab.description}</span>
          </button>
        );
      })}
    </div>
  );
}

export function AdminPanel({ id, active, children }) {
  return (
    <div
      id={`admin-panel-${id}`}
      role="tabpanel"
      aria-labelledby={`admin-tab-${id}`}
      hidden={active !== id}
      className="admin-panel"
    >
      {children}
    </div>
  );
}
