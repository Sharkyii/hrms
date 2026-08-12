import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
}

type ConfirmApi = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmApi | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);

  const confirm = useCallback<ConfirmApi>((options) => {
    return new Promise((resolve) => setState({ ...options, resolve }));
  }, []);

  function close(result: boolean) {
    state?.resolve(result);
    setState(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div className="dialog-overlay" onClick={() => close(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h2>{state.title}</h2>
            <p>{state.message}</p>
            <div className="dialog-actions">
              <button className="btn secondary" onClick={() => close(false)}>Cancel</button>
              <button className="btn danger" onClick={() => close(true)}>{state.confirmLabel ?? "Confirm"}</button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}
