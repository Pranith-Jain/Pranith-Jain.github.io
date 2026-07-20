/**
 * Compatibility shim — prefer importing from `components/ui/CopyButton`.
 *
 * Historical DFIR tools used `value` + `title` props and a separate
 * `CopyChip`. Both now live on the canonical ui CopyButton module.
 */
export { CopyButton, CopyChip } from '../ui/CopyButton';
