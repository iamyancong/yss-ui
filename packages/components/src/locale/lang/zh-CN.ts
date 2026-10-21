import type { YssLocale } from '../types';
import common from './zh-CN/common';
import table from './zh-CN/table';
import formily from './zh-CN/formily';
import fileImport from './zh-CN/fileImport';
import cron from './zh-CN/cron';
import conditionBuilder from './zh-CN/conditionBuilder';
import tree from './zh-CN/tree';
import monthCalendar from './zh-CN/monthCalendar';
import monaco from './zh-CN/monaco';
import splitPane from './zh-CN/splitPane';
import sheet from './zh-CN/sheet';
import filePreview from './zh-CN/filePreview';

const zhCN: YssLocale = {
  name: 'zh-CN',
  common,
  table,
  formily,
  fileImport,
  cron,
  conditionBuilder,
  tree,
  monthCalendar,
  monaco,
  splitPane,
  sheet,
  filePreview,
};

export default zhCN;
