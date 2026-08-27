import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Scope Card SC-3 Conformance Tests (Lobby & Portability Sync)', () => {
  const conflictModalPath = path.resolve(__dirname, '../components/ProgressConflictModal.vue');
  const syncModalPath = path.resolve(__dirname, '../components/ProgressSyncModal.vue');
  const exportViewPath = path.resolve(__dirname, '../components/QrExportView.vue');
  const scannerViewPath = path.resolve(__dirname, '../components/QrScannerView.vue');
  const lobbyViewPath = path.resolve(__dirname, '../../lobby/LobbyView.vue');
  const qrCodeModalPath = path.resolve(__dirname, '../../lobby/QrCodeModal.vue');
  const joinCardPath = path.resolve(__dirname, '../../lobby/JoinCard.vue');

  const conflictModal = fs.readFileSync(conflictModalPath, 'utf-8');
  const syncModal = fs.readFileSync(syncModalPath, 'utf-8');
  const exportView = fs.readFileSync(exportViewPath, 'utf-8');
  const scannerView = fs.readFileSync(scannerViewPath, 'utf-8');
  const lobbyView = fs.readFileSync(lobbyViewPath, 'utf-8');
  const qrCodeModal = fs.readFileSync(qrCodeModalPath, 'utf-8');
  const joinCard = fs.readFileSync(joinCardPath, 'utf-8');

  it('Finding 1: Modals and views use semantic CSS tokens instead of hardcoded dark defaults', () => {
    // Check for eliminated hardcoded dark default colors/aliases in scope files
    const allScopedFiles = [conflictModal, syncModal, exportView, scannerView, lobbyView];
    for (const content of allScopedFiles) {
      expect(content).not.toContain('var(--text-primary, #f8fafc)');
      expect(content).not.toContain('var(--bg-surface-raised, #28284e)');
      expect(content).not.toContain('var(--accent-primary, #7c3aed)');
    }
  });

  it('Finding 8: QrCodeModal.vue uses logical text-align property (text-align: start)', () => {
    expect(qrCodeModal).toContain('text-align: start;');
    expect(qrCodeModal).not.toContain('text-align: left;');
  });

  it('Finding 10: JoinCard.vue validates nickname and binds nicknameError to nickname input', () => {
    expect(joinCard).toContain("nicknameError.value = 'Enter a nickname to join';");
    expect(joinCard).toContain(':error="nicknameError"');
    expect(joinCard).not.toContain("localError.value = 'Please enter your name!';");
  });

  it('Finding 12: ProgressConflictModal.vue uses direct, calm, conflict-appropriate copy tone', () => {
    expect(conflictModal).toContain('Scanned progress has different stats than this device. Choose how to merge:');
    expect(conflictModal).toContain('Smart merge combines both saves safely without data loss.');
    expect(conflictModal).not.toContain('We found existing progress on this device and new progress in your save!');
    expect(conflictModal).not.toContain('No data is lost!');
  });

  it('Finding 13: QrScannerView.vue sets manual-textarea font-size to 16px to prevent iOS Safari auto-zoom', () => {
    expect(scannerView).toMatch(/\.manual-textarea\s*\{[^}]*font-size:\s*16px;/);
  });
});
