<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted, useAttrs } from 'vue';
import QRCode from 'qrcode';
import type { LanInfoResponse } from '@fun-chess/shared';
import BaseModal from '../../components/base/BaseModal.vue';
import BaseButton from '../../components/base/BaseButton.vue';
import { QrCodeCanvas, LanConfigSection } from './components';
import { useLanDiscovery, isValidIPv4 } from './useLanDiscovery';
import {
  isCloudRelayMode,
  resolveEffectiveHost,
  resolveEffectivePort,
  buildLobbyJoinUrl,
} from './lobby_url_builder';
import { useInjectLogger, useInjectClipboard, useInjectLocationProvider } from '@/platform/di';

const logger = useInjectLogger();
const clipboard = useInjectClipboard();
const locationProvider = useInjectLocationProvider();

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
  const host = locationProvider.hostname;
  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    list.add(host);
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

function onIpInput(val: string) {
  customIpInput.value = val;
  ipError.value = '';
  const trimmed = val.trim();
  if (isValidIPv4(trimmed)) {
    setLanIp(trimmed);
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
      <QrCodeCanvas
        :qr-data-url="qrDataUrl"
        :is-generating="qrStatus === 'generating'"
        :error="qrStatus === 'error' ? 'Failed to create QR Code canvas' : null"
        @retry="generateQr"
      />

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
      <LanConfigSection
        v-else
        :interfaces="availableInterfaces"
        :active-ip="effectiveHost"
        :is-cloud-relay="isCloudMode"
        :custom-ip-input="customIpInput"
        :ip-validation-error="ipError"
        :copied="copied"
        @select-ip="selectInterface"
        @update:custom-ip-input="onIpInput"
        @apply-custom-ip="applyCustomIp"
        @copy-link="copyLink"
      />

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
