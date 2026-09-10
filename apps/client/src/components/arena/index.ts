/**
 * @deprecated [MIN-019] Re-export shim pointing to canonical @/features/multiplayer.
 * Dead duplicate component and tests deleted; shim preserved for backwards compatibility with
 * apps/client/src/components/index.ts until cross-card integration (SC-10).
 */
export { default as MultiplayerArena } from '@/features/multiplayer/MultiplayerArena.vue';
export * from '@/features/multiplayer/MultiplayerArena.vue';
