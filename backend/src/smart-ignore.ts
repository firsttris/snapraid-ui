// `smartignore` lines in snapraid.conf: SMART attributes SnapRAID leaves out of its report and
// of its failure probability, on one disk or on all of them ("*"). Since SnapRAID 15 they can be
// smartctl's attribute names besides the ids; the UI writes names, an id means something else on
// some vendors' disks (233 is NAND writes on SanDisk, wearout elsewhere).
import type { SmartIgnoreRule } from "@shared/types.ts";

const SMARTIGNORE_LINE = /^smartignore\s+(\S+)(.*)$/;

// A smartctl attribute name such as Reallocated_Sector_Ct, or an id
export const SMART_ATTRIBUTE_NAME = /^[\w.-]+$/;

/**
 * Parse a `smartignore <disk> <attribute>...` line
 */
export const parseSmartIgnoreLine = (line: string): SmartIgnoreRule | null => {
  const match = line.trim().match(SMARTIGNORE_LINE);
  if (!match) return null;
  return { disk: match[1], attributes: match[2].split(/\s+/).filter(Boolean) };
};

// SnapRAID compares the names case-insensitively
const sameAttribute = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * The config's lines with the attribute ignored on the disk ("*": all disks), or no longer
 * ignored. Ignoring adds it to the disk's line or starts one after the other smartignore lines;
 * removing the last attribute of a line removes the line.
 */
export const editSmartIgnore = (lines: string[], disk: string, attribute: string, ignore: boolean): string[] => {
  const rules = lines.map(parseSmartIgnoreLine);

  if (!ignore) {
    return lines.flatMap((line, index) => {
      const rule = rules[index];
      if (rule?.disk !== disk) return [line];
      const kept = rule.attributes.filter((name) => !sameAttribute(name, attribute));
      if (kept.length === rule.attributes.length) return [line];
      return kept.length > 0 ? [`smartignore ${disk} ${kept.join(" ")}`] : [];
    });
  }

  if (rules.some((rule) => rule?.disk === disk && rule.attributes.some((name) => sameAttribute(name, attribute)))) {
    return lines;
  }
  const own = rules.findIndex((rule) => rule?.disk === disk);
  if (own !== -1) return lines.with(own, `${lines[own].trimEnd()} ${attribute}`);

  const lastRule = rules.findLastIndex((rule) => rule !== null);
  // Before the empty string a final newline leaves behind
  const end = lines.at(-1) === "" ? lines.length - 1 : lines.length;
  return lines.toSpliced(lastRule !== -1 ? lastRule + 1 : end, 0, `smartignore ${disk} ${attribute}`);
};
