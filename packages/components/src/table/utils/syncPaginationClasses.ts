import type { VNode } from 'vue';

/**
 * 同步分页组件内部选项区语义类名（兼容自定义 ConfigProvider prefixCls）
 */
export const syncPaginationClasses = (vnode: VNode): void => {
  const root = vnode.el;
  if (!(root instanceof HTMLElement)) return;

  const listEl = root.matches('ul') ? root : root.querySelector('ul');
  if (!(listEl instanceof HTMLElement)) return;

  const paginationPrefix = Array.from(listEl.classList).find(cls => cls.endsWith('-pagination'));
  if (!paginationPrefix) return;

  listEl.querySelectorAll<HTMLElement>(`.${paginationPrefix}-options`).forEach(optionsEl => {
    optionsEl.classList.add('y-pagination__options');
  });

  listEl
    .querySelectorAll<HTMLElement>(`.${paginationPrefix}-options-size-changer`)
    .forEach(changerEl => {
      changerEl.classList.add('y-pagination__size-changer');

      Array.from(changerEl.children).forEach(child => {
        if (
          child instanceof HTMLElement &&
          Array.from(child.classList).some(cls => cls.endsWith('-select-selector'))
        ) {
          child.classList.add('y-pagination__size-selector');
          child.querySelectorAll<HTMLElement>('span').forEach(spanEl => {
            if (
              Array.from(spanEl.classList).some(cls => cls.endsWith('-select-selection-item'))
            ) {
              spanEl.classList.add('y-pagination__size-item');
            }
          });
        }
      });
    });
};
