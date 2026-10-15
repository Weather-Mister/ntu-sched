// Preserve the COOL list's scroll position during same-tab rerenders.
// Switching between Assignments and Announcements starts at the top.
// Cards are never hidden or paginated by this UI controller.
export function createCoolFeedScroll({list}) {
  let view='assignments';
  function update(nextView=view,previousScrollTop=0) {
    const sameView=nextView===view;
    view=nextView;
    list.scrollTop=sameView?previousScrollTop:0;
  }
  return {
    update,
    reset() {
      view='assignments';
      list.scrollTop=0;
    }
  };
}
