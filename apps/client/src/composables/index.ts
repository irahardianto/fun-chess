/**
 * Public Entry Point: Cross-Cutting Client UI & Presentation Composables
 *
 * Adheres to Vertical Slice Architecture (MAJ-011) and Project Conventions.
 * Domain feature modules must import domain logic from their respective slices:
 * - Board presentation & engine: `@/features/board`
 * - Multiplayer arena & game state: `@/features/multiplayer`
 * - Lobby match setup: `@/features/lobby`
 * - PWA & network connectivity: `@/features/pwa`
 * - Portability & sync: `@/features/portability`
 */

// Multiplayer Connection & Room Lifecycle Slice
export * from './useSocket';

// Board Presentation & Chess Engine
export * from './useChessGame';

// Lobby & LAN Discovery
export * from './useLanDiscovery';

// Multimedia & Sensory Effects
export * from './useAudio';
export * from './useConfetti';

// Platform & Hardware Integrations
export * from './useQrScanner';
export { usePwaInstall, useNetworkStatus } from '../features/pwa';

// Theme & UI Preferences
export * from './useTheme';


