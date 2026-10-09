"use client";

import type { ComponentProps, ReactNode } from "react";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";

import { Input } from "@/components/ui/input";
import { FormLabel } from "./form-label";
import { FormControlRow } from "./form-control-row";
import { cn } from "@/core/utils/cn";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import { useAppForm } from "./form-context";
import { useFormFieldErrors, useResolvedFieldLabel } from "./use-form-field";

type Props = Omit<
  ComponentProps<"input">,
  "value" | "defaultValue" | "onChange" | "type" | "id" | "disabled" | "readOnly" | "size"
> & {
  id: string;
  label?: string | null;
  required?: boolean;
  value?: number;
  onValueChange?: (value: number | undefined) => void;
  className?: string;
  containerClassName?: string;
  endContent?: ReactNode;
  labelEndAddon?: ReactNode;
  controlStartAddon?: ReactNode;
  disabled?: boolean;
  readOnly?: boolean;
};

export const FormNumberInput = observer(
  ({
    id,
    label,
    required,
    value: controlledValue,
    onValueChange,
    className,
    containerClassName,
    onBlur,
    onFocus,
    endContent,
    labelEndAddon,
    controlStartAddon,
    disabled,
    readOnly,
    ...props
  }: Props) => {
    const isReq = required;
    const resolvedLabel = useResolvedFieldLabel(id, label);
    const store = useAppForm();
    const intlStore = useHydratedIntlStore();
    const controlled = onValueChange !== undefined;

    const { hasError } = useFormFieldErrors(id);
    const isDisabled = Boolean(disabled || store?.isLoading);
    const isReadOnly = !isDisabled && Boolean(readOnly || store?.isReadOnly);

    const storeNumber = store?.getValue(id) as number | undefined;
    const activeNumber = controlled ? controlledValue : storeNumber;
    const formattedValue = activeNumber == null ? "" : intlStore.formatNumber(activeNumber);

    const [focused, setFocused] = useState(false);
    const [text, setText] = useState<string>(formattedValue);
    const reselectOnEdit = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
      if (!focused) setText(formattedValue);
    }, [formattedValue, focused]);

    useLayoutEffect(() => {
      if (!focused || !reselectOnEdit.current) return;
      reselectOnEdit.current.select();
      reselectOnEdit.current = null;
    }, [focused, text]);

    function commit(n: number | undefined) {
      if (controlled) onValueChange?.(n);
      else store?.onChange(id, n);
    }

    return (
      <div className={cn("space-y-1.5", containerClassName)}>
        {resolvedLabel && (
          <div className="flex items-center gap-1.5">
            <FormLabel htmlFor={id}>
              {resolvedLabel}

              {isReq ? <span className="text-destructive"> *</span> : null}
            </FormLabel>

            {labelEndAddon}
          </div>
        )}

        <FormControlRow startAddon={controlStartAddon}>
          <Input
            aria-invalid={hasError}
            className={cn(endContent && "pr-8", className)}
            disabled={isDisabled}
            id={id}
            inputMode="decimal"
            readOnly={isReadOnly}
            required={isReq}
            type="text"
            value={text}
            {...props}
            onBlur={(e) => {
              setFocused(false);
              if (isReadOnly) {
                setText(formattedValue);
                onBlur?.(e);
                return;
              }
              const parsed = intlStore.parseNumber(text);
              if (parsed == null && text.trim() !== "") {
                setText(formattedValue);
                onBlur?.(e);
                return;
              }
              setText(parsed == null ? "" : intlStore.formatNumber(parsed));
              commit(parsed);
              onBlur?.(e);
            }}
            onChange={(e) => {
              const next = e.target.value;
              setText(next);
              const parsed = intlStore.parseNumber(next);
              if (parsed != null || next.trim() === "") commit(parsed);
            }}
            onFocus={(e) => {
              if (!isReadOnly) {
                const input = e.currentTarget;
                const selectedAll =
                  input.value !== "" && input.selectionStart === 0 && input.selectionEnd === input.value.length;
                reselectOnEdit.current = selectedAll ? input : null;
                setText(intlStore.formatNumberForEditing(activeNumber));
                setFocused(true);
              }
              onFocus?.(e);
            }}
          />

          {endContent && (
            <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-sm text-muted-foreground">
              {endContent}
            </span>
          )}
        </FormControlRow>
      </div>
    );
  },
);
