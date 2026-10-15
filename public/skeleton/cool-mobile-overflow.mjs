// Mobile-only presentation state for the shared COOL assignments/announcements list.
// Cards stay in the same DOM, so links, completion checks and announcement details keep working.
export const COOL_MOBILE_VISIBLE_COUNT = 4;

export function createCoolMobileOverflow({ list, button, showMore, showLess }) {
  const expanded = { assignments: false, announcements: false };
  let view = 'assignments';

  function update(nextView = view, previousScrollTop = 0) {
    const sameView = nextView === view;
    view = nextView;
    const count = [...list.children].filter(item => item.classList.contains('cool-item')).length;
    const remaining = Math.max(0, count - COOL_MOBILE_VISIBLE_COUNT);
    const open = remaining > 0 && !!expanded[view];

    list.classList.toggle('cool-list-expanded', open);
    button.hidden = remaining === 0;
    button.setAttribute('aria-expanded', String(open));
    button.textContent = open ? showLess() : showMore(remaining);
    // Repaint after account updates without jumping the inner scroll back to the top.
    list.scrollTop = open && sameView ? previousScrollTop : 0;
  }

  button.addEventListener('click', () => {
    if (button.hidden) return;
    expanded[view] = !expanded[view];
    update(view);
  });

  return {
    update,
    reset() {
      expanded.assignments = false;
      expanded.announcements = false;
      view = 'assignments';
      update(view);
    }
  };
}
