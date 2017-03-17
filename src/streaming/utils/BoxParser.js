/**
 * The copyright in this software is being made available under the BSD License,
 * included below. This software may be subject to other third party and contributor
 * rights, including patent rights, and no such rights are granted under this license.
 *
 * Copyright (c) 2013, Dash Industry Forum.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 *  * Redistributions of source code must retain the above copyright notice, this
 *  list of conditions and the following disclaimer.
 *  * Redistributions in binary form must reproduce the above copyright notice,
 *  this list of conditions and the following disclaimer in the documentation and/or
 *  other materials provided with the distribution.
 *  * Neither the name of Dash Industry Forum nor the names of its
 *  contributors may be used to endorse or promote products derived from this software
 *  without specific prior written permission.
 *
 *  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS AS IS AND ANY
 *  EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 *  WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
 *  IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT,
 *  INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT
 *  NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 *  PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
 *  WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 *  ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 *  POSSIBILITY OF SUCH DAMAGE.
 */

import IsoFile from './IsoFile.js';
import FactoryMaker from '../../core/FactoryMaker.js';
import ISOBoxer from 'codem-isoboxer';

const SAMPLE_IS_NON_SYNC = 0x10000;

function BoxParser(/*config*/) {

    let instance;
    let context = this.context;

    /**
     * @param {ArrayBuffer} data
     * @returns {@link IsoFile}
     * @memberof BoxParser#
     */
    function parse(data) {
        if (!data) return null;

        if (data.fileStart === undefined) {
            data.fileStart = 0;
        }

        var parsedFile = ISOBoxer.parseBuffer(data);
        var dashIsoFile = IsoFile(context).create();

        dashIsoFile.setData(parsedFile);

        return dashIsoFile;
    }
    function avccExtraData(data) {
        if (!data) return null;

        var isoFile = parse(data);
        var stsdBox = isoFile.getBox('stsd');
        if (stsdBox && stsdBox.entry_count) {
            for (var i = 0; i < stsdBox.entry_count; i++) {
                if (stsdBox.entries[i].type == 'avc1') {
                    return stsdBox.entries[i].config;
                }
            }
        }
    }

    function isIDR(data, nalLenSize) {
        if (!data) return;

        var pos = 0;
        var len = data.byteLength;
        while (len - pos >= nalLenSize) {
            var nalLen;
            switch (nalLenSize) {
            case 1: nalLen = data.getUint8(pos); break;
            case 2: nalLen = data.getUint16(pos); break;
            case 3: nalLen = data.getUint24(pos); break;
            case 4: nalLen = data.getUint32(pos); break;
            }
            pos += nalLenSize;
            if (!nalLen) {
                continue;
            }
            var t = data.getUint8(pos);
            pos += nalLen;
            if ((t & 0x1f) == 5) {
                // IDR NAL.
                return true;
            }
        }
    }

    function getSyncSamples(extraData, data) {
        if (!data || !extraData) return;

        var isoFile = parse(data);
        var mdatBox = isoFile.getBox('mdat');
        var trunBox = isoFile.getBox('trun');
        if (!trunBox || !trunBox.samples) {
            return;
        }
        var samples = trunBox.samples;
        var pos = mdatBox.offset + 8;
        var nalLenSize = (extraData.getUint8(8 + 4) & 3) + 1;
        var res = [];
        for (var i = 0, len = samples.length; i < len; i++) {
            if (!(samples[i].sample_flags & SAMPLE_IS_NON_SYNC)) {
                var s = {index: i};
                if (isIDR(new DataView(data, pos, samples[i].sample_size), nalLenSize))
                    s.isIDR = true;
                res.push(s);
            }
            pos += samples[i].sample_size;
        }
        return res;
    }

    instance = {
        parse: parse,
        avccExtraData: avccExtraData,
        getSyncSamples: getSyncSamples
    };

    return instance;
}
BoxParser.__dashjs_factory_name = 'BoxParser';
export default FactoryMaker.getSingletonFactory(BoxParser);
