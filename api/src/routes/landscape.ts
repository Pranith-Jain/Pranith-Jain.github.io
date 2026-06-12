/**
 * Re-exports the four landscape handlers under stable handler names so
 * they can be wired into api/src/index.ts without bloating the import
 * list there.
 *
 * The sync functions (syncOwaspAiLandscape / syncCuratedToolbox) are
 * imported by worker/scheduled.ts and called from the daily cron.
 */
export {
  getOwaspAiLandscapeHandler,
  getOwaspAiLandscapeMetaHandler,
  getCuratedToolboxHandler,
  getCuratedToolboxMetaHandler,
} from '../lib/landscape-sync';
