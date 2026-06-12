import { ReactNode, useCallback, useState } from "react";
import ConfirmModal from "../components/ui/ConfirmModal";

export interface ConfirmDialogOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  onConfirm: () => void;
}

interface ConfirmDialogProps {
  loading?: boolean;
}

export function useConfirmDialog() {
  const [options, setOptions] = useState<ConfirmDialogOptions | null>(null);

  const confirm = useCallback((opts: ConfirmDialogOptions) => {
    setOptions(opts);
  }, []);

  const dismiss = useCallback(() => {
    setOptions(null);
  }, []);

  const ConfirmDialog = useCallback(
    ({ loading = false }: ConfirmDialogProps) => (
      <ConfirmModal
        open={!!options}
        title={options?.title ?? "Confirm"}
        message={options?.message ?? ""}
        confirmLabel={options?.confirmLabel ?? "Confirm"}
        cancelLabel={options?.cancelLabel ?? "Cancel"}
        variant={options?.variant ?? "danger"}
        loading={loading}
        onConfirm={() => {
          options?.onConfirm();
          dismiss();
        }}
        onClose={dismiss}
      />
    ),
    [options, dismiss],
  );

  return { confirm, dismiss, ConfirmDialog };
}
