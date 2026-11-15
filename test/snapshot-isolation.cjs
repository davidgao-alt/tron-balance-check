const {test} = require('node:test');
const assert = require('node:assert/strict');
const pg = require('pg');
const mstr = require('../dist/mstr-fetch');
const sharp = require('../dist/sharplink-fetch');
const {insertMstrSharplinkToDB} = require('../dist/insert-mstr-sharplink');
for (const fail of ['MSTR','SharpLink',null]) {
  test(`saves independent snapshots when ${fail ?? 'neither'} fails`, async () => {
    const original = {Client:pg.Client,mstr:mstr.fetchMstrSnapshot,sharp:sharp.fetchSharplinkSnapshot,url:process.env.DATABASE_URL};
    let saved=[],ended=false;
    process.env.DATABASE_URL='mock';
    pg.Client=class {async connect(){} async end(){ended=true;} async query(sql,values){saved.push(sql.includes('INSERT INTO mstr_snapshots')?'MSTR':'SharpLink'); if(saved.at(-1)==='SharpLink') assert.equal(values[5],123); return {rows:[{id:1}]};}};
    mstr.fetchMstrSnapshot=async()=>{if(fail==='MSTR')throw Error('upstream');return {};};
    sharp.fetchSharplinkSnapshot=async()=>{if(fail==='SharpLink')throw Error('upstream');return {sharplink:{averageVolume30Day:123.333333,volume:999},eth:{},impact3:{}};};
    try {
      if(fail)await assert.rejects(insertMstrSharplinkToDB(),new RegExp(fail));
      else await insertMstrSharplinkToDB();
      assert.deepEqual(saved.sort(),['MSTR','SharpLink'].filter(x=>x!==fail).sort());
      assert.equal(ended,true);
    }finally{pg.Client=original.Client;mstr.fetchMstrSnapshot=original.mstr;sharp.fetchSharplinkSnapshot=original.sharp;if(original.url===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=original.url;}
  });
}
