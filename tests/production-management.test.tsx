import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {QuotationPage,MasterDataPage} from '../src/components/ProductionManagement';
import type {Ctx} from '../src/components/ProductionWorkspace';

const c={
 data:{brands:[{id:'brand',name:'Test Brand',active:true,shop_id_tiktok:'TT-TEST',shop_id_shopee:'SP-TEST',shop_id_mirror:'ST-TEST'}],
 studios:[{id:'studio',name:'Studio A',location_id:'jakarta',capacity:2}],
 quotations:[{id:'q',brand_id:'brand',reference:'Q-001',brand:'Test Brand',account:'TT-TEST',platform:'TikTok',hours:10,allocated_hours:2,rate:83333,period_start:'2099-01-01',period_end:'2099-01-31'}]},
 start:'2099-01-01',end:'2099-01-31',busy:false,
} as Ctx;

describe('production management rendering',()=>{
 it('renders quotation edit/delete and preserves rounded total',()=>{
  const html=renderToStaticMarkup(<QuotationPage {...c}/>);
  expect(html).toContain('Quota tracker');expect(html).toContain('Q-001');
  expect(html).toContain('>Edit</button>');expect(html).toContain('>Delete</button>');
  expect(html).toContain('833.000');expect(html).toContain('8 jam');
 });
 it('renders master edit/delete for brands and studios',()=>{
  const html=renderToStaticMarkup(<MasterDataPage {...c}/>);
  expect(html.match(/>Edit<\/button>/g)).toHaveLength(2);
  expect(html.match(/>Delete<\/button>/g)).toHaveLength(2);
  expect(html).toContain('Studio A');expect(html).toContain('TT-TEST');
 });
 it('disables mutation forms and action buttons while busy',()=>{
  for(const Component of [QuotationPage,MasterDataPage]){
   const html=renderToStaticMarkup(<Component {...c} busy/>);
   expect(html).toContain('<fieldset disabled="">');
   expect(html).toMatch(/<button disabled="">Edit<\/button>/);
   expect(html).toMatch(/<button class="danger" disabled="">Delete<\/button>/);
  }
 });
});
