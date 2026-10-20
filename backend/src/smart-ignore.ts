// `smartignore` lines in snapraid.conf: SMART attributes SnapRAID leaves out of its report and
// of its failure probability, on one disk or on all of them ("*"). Since SnapRAID 15 they can be
// smartctl's attribute names besides the ids; the UI writes names, an id means something else on
// some vendors' disks (233 is NAND writes on SanDisk, wearout elsewhere).
import type { SmartIgnoreRule } from "@shared/types.ts";

// SnapRAID keeps four attributes per disk and refuses a config with more on one line
export const SMART_IGNORE_MAX = 4;
// Longer names make SnapRAID refuse the config (SMART_MAX in its sources)
const NAME_MAX = 127;

const SMARTIGNORE_LINE = /^smartignore\s+(\S+)(.*)$/;

/**
 * An attribute SnapRAID accepts in smartignore: an id from 1 to 255, or a smartctl name of up to
 * 127 characters; names may contain /, % or parentheses (Avg_Program/Erase_Ct, SSD_LifeLeft(0.01%))
 */
export const isSmartIgnoreAttribute = (attribute: string): boolean => {
  if (!/^\S+$/.test(attribute) || attribute.length > NAME_MAX) return false;
  if (!/^(\d+|0x[\da-f]+)$/i.test(attribute)) return true;
  const id = Number(attribute);
  return id >= 1 && id <= 255;
};

/**
 * Parse a `smartignore <disk> <attribute>...` line
 */
export const parseSmartIgnoreLine = (line: string): SmartIgnoreRule | null => {
  const match = line.trim().match(SMARTIGNORE_LINE);
  if (!match) return null;
  return { disk: match[1], attributes: match[2].split(/\s+/).filter(Boolean) };
};

/**
 * What SnapRAID applies, one rule per disk: each line fills its disk's slots from the first, so
 * a later line for the same disk overwrites as many attributes of an earlier one as it has
 */
export const effectiveSmartIgnore = (rules: SmartIgnoreRule[]): SmartIgnoreRule[] => {
  const slots = new Map<string, string[]>();
  for (const { disk, attributes } of rules) {
    const current = slots.get(disk) ?? [];
    slots.set(disk, [...attributes, ...current.slice(attributes.length)]);
  }
  return [...slots].map(([disk, attributes]) => ({ disk, attributes }));
};

// SnapRAID compares the names case-insensitively
const sameAttribute = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export class SmartIgnoreFullError extends Error {}

/**
 * The config's lines with the attribute ignored on the disk ("*": all disks), or no longer
 * ignored. The disk's lines become one with what SnapRAID applies from them, in place of the
 * first; a new disk's line goes after the other smartignore lines. Throws SmartIgnoreFullError
 * when the disk already ignores SMART_IGNORE_MAX attributes.
 */
export const editSmartIgnore = (lines: string[], disk: string, attribute: string, ignore: boolean): string[] => {
  const rules = lines.map(parseSmartIgnoreLine);
  const own = rules.flatMap((rule) => (rule?.disk === disk ? [rule] : []));
  const current = effectiveSmartIgnore(own)[0]?.attributes ?? [];
  const present = current.some((name) => sameAttribute(name, attribute));

  if (ignore === present) return lines;
  if (ignore && current.length >= SMART_IGNORE_MAX) throw new SmartIgnoreFullError();

  const attributes = ignore ? [...current, attribute] : current.filter((name) => !sameAttribute(name, attribute));
  const line = attributes.length > 0 ? [`smartignore ${disk} ${attributes.join(" ")}`] : [];
  const first = rules.findIndex((rule) => rule?.disk === disk);
  if (first !== -1) {
    return lines.flatMap((text, index) =>
      index === first ? line : rules[index]?.disk === disk ? [] : [text]
    );
  }

  const lastRule = rules.findLastIndex((rule) => rule !== null);
  // Before the empty string a final newline leaves behind
  const end = lines.at(-1) === "" ? lines.length - 1 : lines.length;
  return lines.toSpliced(lastRule !== -1 ? lastRule + 1 : end, 0, ...line);
};
