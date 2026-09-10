<script setup lang="ts">
import { ref, computed } from 'vue';
import BaseButton from '../../../components/base/BaseButton.vue';
import { isLocalhostAddress } from '../lobby_url_builder';

export interface NetworkInterfaceInfo {
  address?: string;
  name?: string;
  family?: string;
  [key: string]: unknown;
}

export type InterfaceOption = string | NetworkInterfaceInfo;

interface Props {
  interfaces?: InterfaceOption[];
  activeIp?: string;
  isCloudRelay?: boolean;
  customIpInput?: string;
  ipValidationError?: string | null;
  copied?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  interfaces: () => [],
  activeIp: '',
  isCloudRelay: false,
  customIpInput: '',
  ipValidationError: '',
  copied: false,
});

const emit = defineEmits<{
  'select-ip': [ip: string];
  'update:customIpInput': [val: string];
  'apply-custom-ip': [];
  'copy-link': [];
}>();

const showIpGuide = ref(false);

const isLocalhost = computed(() => {
  if (props.isCloudRelay) return false;
  return isLocalhostAddress(props.activeIp);
});

const normalizedInterfaces = computed(() => {
  return props.interfaces
    .map((item) => (typeof item === 'string' ? item : item.address || ''))
    .filter((ip): ip is string => Boolean(ip && ip !== '127.0.0.1'));
});

function onIpInput(e: Event) {
  const target = e.target as HTMLInputElement;
  emit('update:customIpInput', target.value);
}

function prefillPrefix(prefix: string) {
  emit('update:customIpInput', prefix);
}

function selectInterface(ip: string) {
  emit('select-ip', ip);
}

function handleApply() {
  emit('apply-custom-ip');
}
</script>

<template>
  <div class="lan-config-section" :class="{ 'is-warning-mode': isLocalhost }">
    <div class="lan-status-header">
      <span class="lan-status-icon">{{ isLocalhost ? '⚠️' : '📡' }}</span>
      <div class="lan-status-text">
        <strong>{{ isLocalhost ? 'Localhost Detected' : 'Connecting via LAN IP' }}</strong>
        <p v-if="isLocalhost" class="status-tip">
          Phones cannot connect to <code>localhost</code>. Enter your computer's Wi-Fi IP so kids can scan and join:
        </p>
        <p v-else class="status-tip">
          Active host IP: <code>{{ activeIp }}</code>
        </p>
      </div>
    </div>

    <!-- Available Network Interfaces Pills -->
    <div v-if="normalizedInterfaces.length > 0" class="interface-group">
      <span class="sub-label">Discovered IPs:</span>
      <div class="interface-pills">
        <button
          v-for="ip in normalizedInterfaces"
          :key="ip"
          type="button"
          class="pill-btn"
          :class="{ 'is-selected': activeIp === ip }"
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
          :class="{ 'has-error': Boolean(ipValidationError) }"
          :aria-invalid="Boolean(ipValidationError)"
          :aria-describedby="ipValidationError ? 'ip-inline-error' : undefined"
          aria-label="Enter host Wi-Fi IP address"
          data-testid="qr-custom-ip-input"
          @input="onIpInput"
          @keyup.enter="handleApply"
        />
        <BaseButton
          variant="accent"
          size="sm"
          data-testid="apply-custom-ip-btn"
          @click="handleApply"
        >
          Apply IP
        </BaseButton>
      </div>

      <!-- Accessible Inline Error Message -->
      <p
        v-if="ipValidationError"
        id="ip-inline-error"
        class="ip-inline-error"
        role="alert"
        aria-live="polite"
        data-testid="qr-ip-error"
      >
        ⚠️ {{ ipValidationError }}
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
</template>

<style scoped src="../qr-code-modal.css"></style>
