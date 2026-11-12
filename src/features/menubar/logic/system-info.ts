// Parsers for About This Computer. They take file or command output as text
// so they run without GNOME; the shell side reads /proc, /sys and lspci.

const GIB = 1024 * 1024 * 1024;

/** Installed memory from /proc/meminfo, rounded up to an even GB ("32 GB"). */
export function memoryLabel(meminfo: string): string | null {
    const match = /^MemTotal:\s+(\d+)\s*kB/m.exec(meminfo);
    if (!match) return null;
    const gib = (Number(match[1]) * 1024) / GIB;
    let rounded = Math.ceil(gib);
    if (rounded > 2 && rounded % 2 === 1) rounded += 1;
    return `${rounded} GB`;
}

/** First "model name" in /proc/cpuinfo without (R), (TM), "CPU" and the clock speed. */
export function processorName(cpuinfo: string): string | null {
    const match = /^model name\s*:\s*(.+)$/m.exec(cpuinfo);
    if (!match) return null;
    return tidy(
        match[1]
            .replace(/\((R|TM|tm|r)\)/g, '')
            .replace(/\s+CPU\b/g, '')
            .replace(/\s*@\s*[\d.]+\s*GHz/i, ''),
    );
}

const VENDORS: [RegExp, string][] = [
    [/^NVIDIA/i, 'NVIDIA'],
    [/^Intel/i, 'Intel'],
    [/^(Advanced Micro Devices|AMD)/i, 'AMD'],
];

/** GPU names from `lspci` output: vendor plus the bracketed marketing name. */
export function graphicsNames(lspci: string): string[] {
    const names: string[] = [];
    for (const line of lspci.split('\n')) {
        const match = /(?:VGA compatible controller|3D controller|Display controller):\s*(.+)$/.exec(line);
        if (!match) continue;
        const device = match[1].replace(/\s*\(rev [0-9a-f]+\)\s*$/i, '');
        const vendor = VENDORS.find(([pattern]) => pattern.test(device))?.[1];
        // "[AMD/ATI]" names the vendor, not the product.
        const brackets = [...device.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]).filter((b) => !b.includes('/'));
        let product: string;
        if (brackets.length > 0) {
            product = brackets[brackets.length - 1];
        } else {
            product = device.replace(/^.*?(Corporation|Inc\.)\s*/, '').replace(/\[[^\]]*\]\s*/g, '');
        }
        names.push(tidy(vendor && !product.startsWith(vendor) ? `${vendor} ${product}` : product));
    }
    return names;
}

/** PRETTY_NAME from os-release. */
export function osName(osRelease: string): string | null {
    const match = /^PRETTY_NAME=(.*)$/m.exec(osRelease);
    if (!match) return null;
    return match[1].trim().replace(/^["']|["']$/g, '') || null;
}

export interface Dmi {
    vendor: string;
    name: string;
    version: string;
    family: string;
}

const PLACEHOLDER = /^(|to be filled by o\.e\.m\.|system product name|system manufacturer|default string|none|not applicable|o\.e\.m\.|\d+(\.\d+)*|v\d+(\.\d+)*)$/i;

const VENDOR_NAMES: [RegExp, string][] = [
    [/^lenovo/i, 'Lenovo'],
    [/^asus/i, 'ASUS'],
    [/^dell/i, 'Dell'],
    [/^(hp|hewlett)/i, 'HP'],
    [/^acer/i, 'Acer'],
    [/^micro-star|^msi/i, 'MSI'],
];

/**
 * Computer model from /sys/class/dmi/id. Lenovo keeps the readable model in
 * product_version (product_name is a code like "82JU").
 */
export function computerModel(dmi: Dmi): string | null {
    const clean = (s: string) => (PLACEHOLDER.test(s.trim()) ? '' : s.trim());
    const rawVendor = clean(dmi.vendor);
    const vendor = VENDOR_NAMES.find(([pattern]) => pattern.test(rawVendor))?.[1] ?? rawVendor;
    const lenovo = vendor === 'Lenovo';
    const model = (lenovo && clean(dmi.version)) || clean(dmi.name) || clean(dmi.family);
    if (!model) return null;
    if (!vendor || model.toLowerCase().startsWith(vendor.toLowerCase())) return model;
    return `${vendor} ${model}`;
}

function tidy(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
}
