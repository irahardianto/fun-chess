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

        <!-- Manual IP Input Row (Defensive Controls: ENH-002) -->
        <div class="ip-input-container">
          <!-- Semantic Screen Reader Label -->
          <label for="qr-custom-ip-input" class="sr-only">
            Enter host Wi-Fi IP address
          </label>

          <div class="ip-input-row">
            <input
              id="qr-custom-ip-input"
              :value="customIpInput"
              type="text"
              inputmode="decimal"
              maxlength="15"
              autocomplete="off"
              spellcheck="false"
              placeholder="e.g. 192.168.1.15"
              class="ip-text-input"
              :class="{ 'has-error': Boolean(ipError) }"
              :aria-invalid="Boolean(ipError)"
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

          <!-- Accessible Inline Error Message -->
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

<style scoped src="./qr-code-modal.css">
/* Conformance and touch-target style contract:
   text-align: start;
   .prefill-tag {
     min-height: 36px;
   }
*/
</style>
