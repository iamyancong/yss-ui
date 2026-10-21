import type { YssLocale } from '../types';
import common from './zh-TW/common';
import table from './zh-TW/table';
import formily from './zh-TW/formily';
import fileImport from './zh-TW/fileImport';
import cron from './zh-TW/cron';
import conditionBuilder from './zh-TW/conditionBuilder';
import tree from './zh-TW/tree';
import monthCalendar from './zh-TW/monthCalendar';
import monaco from './zh-TW/monaco';
import splitPane from './zh-TW/splitPane';
import sheet from './zh-TW/sheet';
import filePreview from './zh-TW/filePreview';

const zhTW: YssLocale = {
  name: 'zh-TW',
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

export default zhTW;
