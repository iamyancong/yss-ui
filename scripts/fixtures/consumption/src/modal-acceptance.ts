import { createApp, defineAsyncComponent, h, ref } from 'vue';
import { Modal } from 'ant-design-vue';
import { YButton } from '@yss-ui/components';
import '@yss-ui/components/style.css';

/** 首次打开弹窗时才加载表单页面，用于真实消费者的交互验收。 */
const Form = defineAsyncComponent(() => import('./Form.vue'));
createApp({
  setup() {
    const open = ref(false);
    return () =>
      h('div', [
        h(
          YButton,
          {
            onClick: () => {
              open.value = true;
            },
          },
          () => 'Open form'
        ),
        h(
          Modal,
          {
            open: open.value,
            title: 'Lazy form',
            destroyOnClose: true,
            onCancel: () => {
              open.value = false;
            },
            'onUpdate:open': (value: boolean) => {
              open.value = value;
            },
          },
          { default: () => (open.value ? h(Form) : null) }
        ),
      ]);
  },
}).mount('#modal-app');
