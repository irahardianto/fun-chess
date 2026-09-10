/**
 * Pure validation and payload decoding engine for Fun Chess progress sync (MAJ-021).
 * Adheres to Architectural Patterns Rule 2 (Pure Business Logic):
 * No Vue state, no DOM side-effects, deterministic input -> output transformation.
 */

import type {
  UnifiedProgressPayload,
  ProgressCodec,
  SchemaValidator,
} from '@fun-chess/shared';
import { FUN_CHESS_PAYLOAD_MAGIC_PREFIX } from '@fun-chess/shared';

export const MAX_SYNC_PAYLOAD_BYTES = 2 * 1024 * 1024; // 2MB

export interface ValidateAndDecodeOptions {
  codec: ProgressCodec;
  validator: SchemaValidator;
  maxBytes?: number;
  onWarn?: (message: string, meta: Record<string, unknown>) => void;
}

/**
 * Validates and decodes raw QR or JSON string into a verified UnifiedProgressPayload.
 *
 * @throws Error on invalid payload structure, oversized data, or malformed JSON.
 */
export async function validateAndDecodePayload(
  rawStringOrJson: string,
  options: ValidateAndDecodeOptions
): Promise<UnifiedProgressPayload> {
  const { codec, validator, maxBytes = MAX_SYNC_PAYLOAD_BYTES, onWarn } = options;

  if (!rawStringOrJson || typeof rawStringOrJson !== 'string') {
    throw new Error('Select a valid save file (.json) or scan a QR code.');
  }

  if (rawStringOrJson.length > maxBytes) {
    throw new Error('Save data exceeds maximum allowed size of 2MB.');
  }

  const trimmed = rawStringOrJson.trim();

  if (trimmed.startsWith(FUN_CHESS_PAYLOAD_MAGIC_PREFIX)) {
    return codec.decodeFromQrString(trimmed);
  }

  if (trimmed.startsWith('{') && trimmed.includes('FC_PROGRESS_V1')) {
    return codec.decodeFromEnvelopeJson(trimmed);
  }

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      return validator.assertValid(parsed);
    } catch (parseErr: unknown) {
      onWarn?.('JSON parse failed on import payload', {
        error: parseErr instanceof Error ? parseErr.message : String(parseErr),
      });
      throw new Error('Invalid JSON format in save data.');
    }
  }

  throw new Error(
    'Unrecognized save data format. Scan a Fun Chess QR code or select a funchess-save.json file.'
  );
}
