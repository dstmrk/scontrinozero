"use client";

import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface EditSettingsDialogProps {
  ariaLabel: string;
  title: string;
  description: React.ReactNode;
  isOpen: boolean;
  isPending: boolean;
  rootError?: string;
  onOpen: () => void;
  onClose: () => void;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  children: React.ReactNode;
}

/**
 * Shared shell for settings edit dialogs: renders the pencil trigger button,
 * the Dialog with header, a <form> wrapper with error display and footer buttons.
 * The parent is responsible for wrapping this with <Form {...form}> (RHF context).
 */
export function EditSettingsDialog({
  ariaLabel,
  title,
  description,
  isOpen,
  isPending,
  rootError,
  onOpen,
  onClose,
  onSubmit,
  children,
}: EditSettingsDialogProps) {
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={onOpen}
        aria-label={ariaLabel}
      >
        <Pencil className="h-4 w-4" />
      </Button>

      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="overscroll-contain">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <form onSubmit={onSubmit} noValidate className="space-y-4">
            {children}

            {rootError && (
              <p className="text-destructive text-sm" role="alert">
                {rootError}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isPending}
              >
                Annulla
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Salvataggio…" : "Salva"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
