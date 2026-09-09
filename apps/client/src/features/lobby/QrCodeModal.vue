<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted, useAttrs } from 'vue';
import QRCode from 'qrcode';
import type { LanInfoResponse } from '@fun-chess/shared';
import BaseModal from '../../components/base/BaseModal.vue';
import BaseButton from '../../components/base/BaseButton.vue';
import { useLanDiscovery, isValidIPv4 } from './useLanDiscovery';
import {
  isCloudRelayMode,
  resolveEffectiveHost,
  resolveEffectivePort,
  buildLobbyJoinUrl,
  isLocalhostAddress,
} from './lobby_url_builder';
import { useInjectLogger, useInjectClipboard } from '@/platform/di';

const logger = useInjectLogger();
const clipboard = useInjectClipboard();

type QrGenerationStatus = 'generating' | 'ready' | 'error';

interface Props {
  modelValue?: boolean;
  roomCode: string;
  joinUrl?: string;
  lanInfo?: LanInfoResponse | null;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  joinUrl: '',
  lanInfo: null,
});

const attrs = useAttrs();
const isModalVisible = computed(() => Boolean(props.modelValue || attrs.isOpen));

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  close: [];
}>();

const qrStatus = ref<QrGenerationStatus>('generating');
const qrDataUrl = ref<string>('');
const copied = ref(false);
let copyTimeout: ReturnType<typeof setTimeout> | null = null;
const copyError = ref(false);
let copyErrorTimeout: ReturnType<typeof setTimeout> | null = null;
const showIpGuide = ref(false);

// Composable for persistent LAN discovery and WebRTC detection
const { serverLanInfo, activeLanIp, setLanIp } = useLanDiscovery();

const customIpInput = ref<string>('');
const ipError = ref<string>('');

onMounted(() => {
  if (activeLanIp.value && activeLanIp.value !== '127.0.0.1') {
    customIpInput.value = activeLanIp.value;
  }
});

watch(
  () => activeLanIp.value,
  (newIp) => {
    if (newIp && newIp !== '127.0.0.1' && !customIpInput.value) {
      customIpInput.value = newIp;
    }
  }
);

const availableInterfaces = computed(() => {
  const list = new Set<string>();
  const info = props.lanInfo || serverLanInfo.value;
  if (info?.interfaces) {
    info.interfaces.forEach((ip) => {
      if (ip && ip !== '127.0.0.1') list.add(ip);
    });
  }
  if (info?.lanIp && info.lanIp !== '127.0.0.1') {
    list.add(info.lanIp);
  }
  if (activeLanIp.value && activeLanIp.value !== '127.0.0.1' && activeLanIp.value !== 'localhost') {
    list.add(activeLanIp.value);
  }
  if (
    typeof window !== 'undefined' &&
    window.location.hostname &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1'
  ) {
    list.add(window.location.hostname);
  }
  return Array.from(list);
});

const isCloudMode = computed(() =>
  isCloudRelayMode({
    lanInfo: props.lanInfo || serverLanInfo.value,
  })
);

const effectiveHost = computed(() =>
  resolveEffectiveHost({
    lanInfo: props.lanInfo || serverLanInfo.value,
    activeLanIp: activeLanIp.value,
    isCloud: isCloudMode.value,
  })
);

const effectivePort = computed(() =>
  resolveEffectivePort({
    lanInfo: props.lanInfo || serverLanInfo.value,
    isCloud: isCloudMode.value,
  })
);

const effectiveJoinUrl = computed(() =>
  buildLobbyJoinUrl({
    lanInfo: props.lanInfo || serverLanInfo.value,
    activeLanIp: activeLanIp.value,
    roomCode: props.roomCode,
    joinUrl: props.joinUrl,
  })
);

const isLocalhost = computed(() => {
  if (isCloudMode.value) return false;
  return isLocalhostAddress(effectiveHost.value);
});

async function generateQr() {
  qrStatus.value = 'generating';
  try {
    const url = await QRCode.toDataURL(effectiveJoinUrl.value, {
      width: 220,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });
    qrDataUrl.value = url;
    qrStatus.value = 'ready';
  } catch (err: unknown) {
    qrStatus.value = 'error';
    logger.error('Failed to generate QR code', {
      operation: 'qr_generate',
      roomCode: props.roomCode,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

watch(
  () => [props.modelValue, attrs.isOpen, props.roomCode, props.joinUrl, effectiveJoinUrl.value],
  () => {
    if (isModalVisible.value) {
      generateQr();
    }
  },
  { immediate: true }
);

function onIpInput(e: Event) {
  const target = e.target as HTMLInputElement;
  const val = target.value.trim();
  customIpInput.value = val;
  ipError.value = '';
  if (isValidIPv4(val)) {
    setLanIp(val);
    generateQr();
  }
}

function applyCustomIp() {
  const val = customIpInput.value.trim();
  if (isValidIPv4(val)) {
    ipError.value = '';
    setLanIp(val);
    generateQr();
  } else if (val.length > 0) {
    ipError.value = 'Enter a valid IPv4 address (e.g. 192.168.1.15).';
  } else {
    ipError.value = 'Enter an IP address.';
  }
}

function selectInterface(ip: string) {
  customIpInput.value = ip;
  ipError.value = '';
  setLanIp(ip);
  generateQr();
}

function prefillPrefix(prefix: string) {
  customIpInput.value = prefix;
  ipError.value = '';
}

async function copyLink() {
  const text = effectiveJoinUrl.value;
  let succeeded: boolean;

  try {
    succeeded = await clipboard.copyText(text);
  } catch (err: unknown) {
    logger.warn('Failed to copy to clipboard via clipboard service', {
      operation: 'qr_modal_copy_clipboard',
      error: err instanceof Error ? err.message : String(err),
    });
    succeeded = false;
  }

  if (succeeded) {
    copied.value = true;
    copyError.value = false;
    if (copyTimeout) clearTimeout(copyTimeout);
    copyTimeout = setTimeout(() => {
      copied.value = false;
      copyTimeout = null;
    }, 2000);
  } else {
    copyError.value = true;
    if (copyErrorTimeout) clearTimeout(copyErrorTimeout);
    copyErrorTimeout = setTimeout(() => {
      copyError.value = false;
      copyErrorTimeout = null;
    }, 5000);
  }
}

onUnmounted(() => {
  if (copyTimeout) {
    clearTimeout(copyTimeout);
    copyTimeout = null;
  }
  if (copyErrorTimeout) {
    clearTimeout(copyErrorTimeout);
    copyErrorTimeout = null;
  }
});

function handleClose() {
  emit('update:modelValue', false);
  emit('close');
}
</script>

<template>
  <BaseModal
    :model-value="isModalVisible"
    title="Invite Player 2! 🚀"
    size="md"
    @update:model-value="(val) => emit('update:modelValue', val)"
    @close="handleClose"
  >
    <div class="qr-modal-content">
      <p class="qr-subtitle">
        {{
          isCloudMode
            ? 'Share via Cloud Link / QR Code — play with friends anywhere online!'
            : 'Scan this QR code with any phone or tablet on the same Wi-Fi to join instantly!'
        }}
      </p>

      <!-- 4-Letter Code Display Pill -->
      <div
        data-testid="room-code-display"
        class="room-code-badge"
        :aria-label="`Room Code: ${props.roomCode}`"
      >
        <span class="code-label">Room Code</span>
        <span class="code-value">{{ props.roomCode }}</span>
      </div>

      <!-- QR Code Image Frame & Error Fallback -->
      <div v-if="qrStatus === 'ready'" class="qr-canvas-card">
        <img
          v-if="qrDataUrl"
          :src="qrDataUrl"
          alt="QR Code to join chess match"
          class="qr-image"
        />
      </div>

      <div
        v-else-if="qrStatus === 'error'"
        class="qr-canvas-card--error"
        role="alert"
        aria-live="assertive"
      >
        <span class="qr-error-icon" aria-hidden="true">⚠️</span>
        <div class="qr-error-title">Failed to create QR Code canvas</div>
        <p class="qr-error-desc">
          Your device browser couldn't draw the QR code. You can still join instantly using the 4-letter code or link!
        </p>
        <button
          type="button"
          class="qr-retry-btn"
          aria-label="Retry generating QR code"
          @click="generateQr"
        >
          🔄 Retry QR Code
        </button>
        <div class="qr-loading-placeholder" style="display: none">
          Generating QR Code...
        </div>
      </div>

      <div v-else class="qr-canvas-card">
        <div class="qr-loading-placeholder">
          Generating QR Code...
        </div>
      </div>

      <!-- Cloud Relay Status Banner -->
      <div v-if="isCloudMode" class="cloud-relay-card" data-testid="qr-cloud-status">
        <span class="cloud-relay-icon">☁️</span>
        <div class="cloud-relay-text">
          <strong>☁️ Cloud Server Online</strong>
          <p class="status-tip">
            Your game room is live on the cloud! Anyone with the link or QR code can join from anywhere.
          </p>
        </div>
      </div>

      <!-- IP Configuration & Localhost Notice (LAN Mode) -->
      <div v-else class="lan-config-section" :class="{ 'is-warning-mode': isLocalhost }">
        <div class="lan-status-header">
          <span class="lan-status-icon">{{ isLocalhost ? '⚠️' : '📡' }}</span>
          <div class="lan-status-text">
            <strong>{{ isLocalhost ? 'Localhost Detected' : 'Connecting via LAN IP' }}</strong>
            <p v-if="isLocalhost" class="status-tip">
              Phones cannot connect to <code>localhost</code>. Enter your computer's Wi-Fi IP so kids can scan and join:
            </p>
            <p v-else class="status-tip">
              Active host IP: <code>{{ effectiveHost }}</code>
            </p>
          </div>
        </div>

        <!-- Available Network Interfaces Pills -->
        <div v-if="availableInterfaces.length > 0" class="interface-group">
          <span class="sub-label">Discovered IPs:</span>
          <div class="interface-pills">
            <button
              v-for="ip in availableInterfaces"
              :key="ip"
              type="button"
              class="pill-btn"
              :class="{ 'is-selected': effectiveHost === ip }"
              @click="selectInterface(ip)"
            >
              {{ ip }}
            </button>
          </div>
        </div>

        <!-- Manual IP Input Row -->
        <div class="ip-input-container">
          <div class="ip-input-row">
            <input
              :value="customIpInput"
              type="text"
              placeholder="e.g. 192.168.1.15"
              class="ip-text-input"
              :class="{ 'has-error': !!ipError }"
              :aria-invalid="!!ipError"
              :aria-describedby="ipError ? 'ip-inline-error' : undefined"
              aria-label="Enter host Wi-Fi IP address"
              data-testid="qr-custom-ip-input"
              @input="onIpInput"
              @keyup.enter="applyCustomIp"
            />
            <BaseButton
              variant="accent"
              size="sm"
              data-testid="apply-custom-ip-btn"
              @click="applyCustomIp"
            >
              Apply IP
            </BaseButton>
          </div>

          <!-- Inline Error Message -->
          <p
            v-if="ipError"
            id="ip-inline-error"
            class="ip-inline-error"
            role="alert"
            aria-live="polite"
            data-testid="qr-ip-error"
          >
            ⚠️ {{ ipError }}
          </p>

          <!-- Quick Prefill Subnet Buttons (when empty and on localhost) -->
          <div v-if="isLocalhost && !customIpInput" class="prefill-helpers">
            <span class="prefill-label">Quick prefill:</span>
            <button
              type="button"
              class="prefill-tag"
              :aria-label="'Prefill subnet prefix 192.168.1.'"
              @click="prefillPrefix('192.168.1.')"
            >
              192.168.1._
            </button>
            <button
              type="button"
              class="prefill-tag"
              :aria-label="'Prefill subnet prefix 192.168.0.'"
              @click="prefillPrefix('192.168.0.')"
            >
              192.168.0._
            </button>
            <button
              type="button"
              class="prefill-tag"
              :aria-label="'Prefill subnet prefix 10.0.0.'"
              @click="prefillPrefix('10.0.0.')"
            >
              10.0.0._
            </button>
          </div>

          <!-- Collapsible Help Guide -->
          <div class="ip-help-wrapper">
            <button
              type="button"
              class="help-toggle-btn"
              :aria-expanded="showIpGuide"
              @click="showIpGuide = !showIpGuide"
            >
              {{ showIpGuide ? '▲ Hide IP help' : '❓ How to find your computer IP' }}
            </button>
            <div v-if="showIpGuide" class="ip-guide-box">
              <p><strong>Windows:</strong> Press <kbd>Win+R</kbd>, type <code>cmd</code>, run <code>ipconfig</code> (look for IPv4 Address).</p>
              <p><strong>Mac:</strong> System Settings → Wi-Fi → Details → IP Address.</p>
              <p><strong>Linux:</strong> Run <code>hostname -I</code> or <code>ip addr</code>.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- URL Preview and Copy Action -->
      <div class="qr-actions">
        <p class="url-preview">{{ effectiveJoinUrl }}</p>
        <BaseButton
          data-testid="copy-link-btn"
          variant="primary"
          size="md"
          full-width
          @click="copyLink"
        >
          <template #icon-left>
            <span>{{ copied ? '✅' : '📋' }}</span>
          </template>
          {{ copied ? 'Copied! ✅' : 'Copy Invite Link' }}
        </BaseButton>

        <p
          v-if="copyError"
          class="copy-error-notice"
          role="alert"
          aria-live="polite"
          data-testid="copy-error-notice"
        >
          ⚠️ Could not copy automatically. Please select and copy the link above.
        </p>
      </div>

      <!-- Network Info Footer -->
      <div class="network-info-footer">
        <span v-if="isCloudMode">☁️ Cloud Multiplayer • Online Relay Active</span>
        <span v-else>📡 Wi-Fi Multiplayer • Host: {{ effectiveHost }}:{{ effectivePort }}</span>
      </div>
    </div>
  </BaseModal>
</template>

<style scoped>
.qr-modal-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  text-align: center;
}

.cloud-relay-card {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  background-color: var(--color-primary-subtle, rgba(108, 92, 231, 0.12));
  border: 1.5px solid var(--color-primary, #6c5ce7);
  border-radius: var(--radius-lg, 16px);
  padding: var(--space-3) var(--space-4);
  width: 100%;
  max-width: 380px;
  box-sizing: border-box;
  text-align: start;
}

.cloud-relay-icon {
  font-size: 1.8rem;
  line-height: 1;
}

.cloud-relay-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cloud-relay-text strong {
  font-family: var(--font-display);
  font-size: var(--text-sm);
  color: var(--text-main);
}

.qr-subtitle {
  font-family: var(--font-body);
  font-size: var(--text-base);
  color: var(--text-muted);
  max-width: 340px;
}

.room-code-badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-color: var(--bg-app);
  border: 2px dashed var(--color-primary);
  border-radius: var(--radius-xl);
  padding: var(--space-2) var(--space-6);
  box-shadow: var(--shadow-sm);
}

.code-label {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: var(--weight-bold);
  color: var(--text-muted);
  letter-spacing: 0.1em;
}

.code-value {
  font-family: var(--font-mono);
  font-size: var(--text-room-code);
  font-weight: var(--weight-heavy);
  color: var(--color-primary);
  letter-spacing: var(--tracking-code);
  line-height: 1.1;
}

.qr-canvas-card {
  padding: var(--space-3);
  background-color: #ffffff;
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-md);
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 220px;
  min-height: 220px;
}

.qr-image {
  display: block;
  width: 220px;
  height: 220px;
  border-radius: calc(var(--radius-xl, 22px) - var(--space-3, 12px));
}

.qr-loading-placeholder {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--text-muted);
}

/* Error State Card Frame (ENH-004) */
.qr-canvas-card--error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 240px;
  min-height: 240px;
  padding: var(--space-4);
  background-color: var(--soft-error-bg, hsl(350 90% 96%));
  border: 2px dashed var(--color-danger, #ef4444);
  border-radius: var(--radius-xl, 22px);
  text-align: center;
  box-sizing: border-box;
  animation: shake-soft var(--duration-normal, 240ms) var(--ease-spring, cubic-bezier(0.175, 0.885, 0.32, 1.275));
}

/* Error Icon Halo */
.qr-error-icon {
  font-size: 32px;
  margin-bottom: var(--space-2, 8px);
  filter: drop-shadow(0 2px 8px rgba(220, 38, 38, 0.35));
}

/* Accessible Error Copy */
.qr-error-title {
  font-family: var(--font-display);
  font-size: var(--text-base);
  font-weight: var(--weight-bold, 700);
  color: var(--soft-error-text, hsl(350 75% 35%));
  margin-bottom: var(--space-1, 4px);
}

.qr-error-desc {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  color: var(--text-muted);
  line-height: var(--leading-snug, 1.3);
  margin-bottom: var(--space-3, 12px);
  text-wrap: pretty;
}

/* Retry Action Button */
.qr-retry-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1-5, 6px);
  min-height: 44px;
  min-width: 140px;
  padding: var(--space-2, 8px) var(--space-4, 16px);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: var(--weight-bold, 700);
  color: var(--text-on-primary, #ffffff);
  background-color: var(--color-primary);
  border: none;
  border-radius: var(--radius-btn, 16px);
  box-shadow: var(--shadow-btn-primary);
  cursor: pointer;
  transition: transform var(--duration-fast, 140ms) var(--ease-spring, cubic-bezier(0.175, 0.885, 0.32, 1.275));
}

.qr-retry-btn:hover {
  background-color: var(--color-primary-hover);
  box-shadow: var(--shadow-btn-primary-hover);
  transform: translateY(-2px);
}

.qr-retry-btn:active {
  background-color: var(--color-primary-active);
  box-shadow: var(--shadow-btn-primary-active);
  transform: translateY(2px);
}

.lan-config-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  background-color: var(--bg-app);
  padding: var(--space-3);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-medium);
  width: 100%;
  max-width: 380px;
  box-sizing: border-box;
  text-align: start;
  transition: border-color var(--duration-fast) ease, background-color var(--duration-fast) ease;
}

.lan-config-section.is-warning-mode {
  border-color: var(--color-accent);
  background-color: var(--color-accent-subtle);
}

.lan-status-header {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
}

.lan-status-icon {
  font-size: 1.3rem;
  line-height: 1;
}

.lan-status-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-family: var(--font-body);
  font-size: var(--text-xs);
  color: var(--text-main);
}

.lan-status-text strong {
  font-family: var(--font-display);
  font-size: var(--text-sm);
  color: var(--text-main);
}

.status-tip {
  margin: 0;
  color: var(--text-muted);
  line-height: 1.4;
}

.status-tip code {
  background: var(--bg-surface);
  padding: 2px 5px;
  border-radius: 4px;
  font-family: var(--font-mono);
  font-weight: bold;
  color: var(--color-primary);
}

.interface-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: var(--space-1);
}

.sub-label {
  font-family: var(--font-display);
  font-size: var(--text-xs);
  color: var(--text-muted);
  font-weight: bold;
}

.interface-pills {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.pill-btn {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border-medium);
  background: var(--bg-surface);
  color: var(--text-main);
  cursor: pointer;
  transition: border-color var(--duration-fast) ease, transform var(--duration-fast) ease, background-color var(--duration-fast) ease, color var(--duration-fast) ease;
}

.pill-btn:hover {
  border-color: var(--color-primary);
  transform: translateY(-1px);
}

.pill-btn.is-selected {
  background: var(--color-primary);
  color: var(--text-on-primary);
  border-color: var(--color-primary);
  font-weight: bold;
}

.ip-input-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-top: var(--space-1);
}

.ip-input-row {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

@media (max-width: 480px) {
  .ip-input-row {
    flex-wrap: wrap;
  }
  .ip-input-row .ip-text-input {
    width: 100%;
    min-width: 100%;
  }
  .ip-input-row :deep(button),
  .ip-input-row button {
    width: 100%;
    justify-content: center;
  }
}

.ip-text-input {
  flex: 1;
  font-family: var(--font-mono);
  font-size: 16px;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  border: 1.5px solid var(--border-medium);
  background: var(--bg-surface);
  color: var(--text-main);
  outline: none;
  transition: border-color var(--duration-fast);
}

.ip-text-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-subtle);
}

.ip-text-input.has-error {
  border-color: var(--color-danger, #ef4444);
}

.ip-text-input.has-error:focus {
  border-color: var(--color-danger, #ef4444);
  box-shadow: 0 0 0 2px hsla(var(--color-danger-h, 354), 88%, 58%, 0.25);
}

.ip-inline-error {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: var(--weight-bold, 700);
  color: var(--color-danger, #ef4444);
  margin: 0;
  text-align: start;
}

.prefill-helpers {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.prefill-label {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.prefill-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  background: var(--bg-surface);
  border: 1px dashed var(--border-medium);
  padding: 4px 8px;
  min-height: 36px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--color-primary);
  transition: background-color var(--duration-fast) ease, border-color var(--duration-fast) ease;
}

.prefill-tag:hover {
  background: var(--color-primary-subtle);
  border-color: var(--color-primary);
}

.ip-help-wrapper {
  margin-top: 2px;
}

.help-toggle-btn {
  background: none;
  border: none;
  font-family: var(--font-body);
  font-size: var(--text-xs);
  color: var(--color-primary);
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
}

.ip-guide-box {
  margin-top: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--bg-surface);
  border-radius: calc(var(--radius-lg, 16px) - var(--space-3, 12px));
  border: 1px solid var(--border-subtle);
  font-family: var(--font-body);
  font-size: var(--text-xs);
  color: var(--text-muted);
  line-height: 1.5;
}

.ip-guide-box p {
  margin: 2px 0;
}

.ip-guide-box kbd {
  background: var(--bg-app);
  border: 1px solid var(--border-medium);
  border-radius: 3px;
  padding: 1px 4px;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

.ip-guide-box code {
  font-family: var(--font-mono);
  color: var(--color-primary);
  font-weight: bold;
}

.qr-actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 100%;
}

.url-preview {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
  background-color: var(--bg-app);
  padding: var(--space-1-5) var(--space-3);
  border-radius: var(--radius-md);
  word-break: break-all;
}

.copy-error-notice {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: var(--weight-bold, 700);
  color: var(--color-danger, #ef4444);
  margin: 0;
  text-align: center;
}

.network-info-footer {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  color: var(--text-faint);
  padding-top: var(--space-2);
  border-top: 1px solid var(--border-subtle);
  width: 100%;
}
</style>
