import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    computerModel,
    graphicsNames,
    memoryLabel,
    osName,
    processorName,
} from '../../src/features/menubar/logic/system-info.js';

test('memory is rounded up to the installed size, like About This Mac', () => {
    assert.equal(memoryLabel('MemTotal:       32633628 kB\nMemFree: 1 kB\n'), '32 GB');
    assert.equal(memoryLabel('MemTotal:        7902444 kB\n'), '8 GB');
    assert.equal(memoryLabel('MemTotal:       16000000 kB\n'), '16 GB');
    assert.equal(memoryLabel('nothing here'), null);
});

test('processor name drops trademarks and the clock speed', () => {
    const cpuinfo = 'processor\t: 0\nmodel name\t: 11th Gen Intel(R) Core(TM) i5-11400H @ 2.70GHz\n';
    assert.equal(processorName(cpuinfo), '11th Gen Intel Core i5-11400H');
    assert.equal(processorName('model name\t: AMD Ryzen 7 5800H with Radeon Graphics\n'), 'AMD Ryzen 7 5800H with Radeon Graphics');
    assert.equal(processorName(''), null);
});

test('graphics names come from lspci, vendor plus the marketing name', () => {
    const lspci = [
        '0000:00:02.0 VGA compatible controller: Intel Corporation TigerLake-H GT1 [UHD Graphics] (rev 01)',
        '0000:00:1f.3 Audio device: Intel Corporation Tiger Lake-H HD Audio Controller (rev 11)',
        '0000:01:00.0 VGA compatible controller: NVIDIA Corporation GA107M [GeForce RTX 3050 Mobile] (rev a1)',
        '0000:05:00.0 Display controller: Advanced Micro Devices, Inc. [AMD/ATI] Cezanne (rev c6)',
    ].join('\n');
    assert.deepEqual(graphicsNames(lspci), ['Intel UHD Graphics', 'NVIDIA GeForce RTX 3050 Mobile', 'AMD Cezanne']);
});

test('OS name is PRETTY_NAME without quotes', () => {
    assert.equal(osName('NAME="Zorin OS"\nPRETTY_NAME="Zorin OS 18.1"\n'), 'Zorin OS 18.1');
    assert.equal(osName('NAME=Arch\n'), null);
});

test('computer model from DMI, skipping placeholder values', () => {
    assert.equal(computerModel({ vendor: 'Acer', name: 'Nitro AN515-57', version: 'V1.17', family: 'Nitro 5' }), 'Acer Nitro AN515-57');
    assert.equal(computerModel({ vendor: 'LENOVO', name: '82JU', version: 'Legion 5 15ACH6H', family: 'Legion 5' }), 'Lenovo Legion 5 15ACH6H');
    assert.equal(computerModel({ vendor: 'ASUSTeK COMPUTER INC.', name: 'ROG Strix G513QM', version: '1.0', family: '' }), 'ASUS ROG Strix G513QM');
    assert.equal(computerModel({ vendor: 'Dell Inc.', name: 'Dell XPS 13 9310', version: '', family: '' }), 'Dell XPS 13 9310');
    assert.equal(computerModel({ vendor: 'To be filled by O.E.M.', name: 'System Product Name', version: '', family: '' }), null);
});
