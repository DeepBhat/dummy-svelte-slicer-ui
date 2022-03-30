<script>
  import { Icon, Button } from "svelte-materialify";
  import { mdiHome, mdiAlert, mdiPen, mdiCloud } from "@mdi/js";
  import DummyPanel from "./panels/dummyPanel.svelte";
  import DummyPanel2 from "./panels/dummyPanel2.svelte";
  import DummyPanel3 from "./panels/dummyPanel3.svelte";

  export let name;

  const panels = [
    { menu: "dummy", component: DummyPanel },
    { menu: "dummy2", component: DummyPanel2 },
    { menu: "dummy3", component: DummyPanel3 },
  ];
  let selectedPanel = undefined;

  function selectPanel(menuName) {
    const newPanel = panels.find((panel) => panel.menu === menuName);
    if (newPanel == selectedPanel) {
      selectedPanel = undefined;
    } else {
      selectedPanel = newPanel;
    }
  }

  function closePanel() {
    selectedPanel = undefined;
  }

  function isExcluded(target) {
    var parent = target;
    while (parent) {
      if (parent === child) {
        return true;
      }
      parent = parent.parentNode;
    }
    return false;
  }

  // function handleClickOutside(event) {
  //   // we wish to close the panel when the user anywhere outside the toolbar buttons,
  //   // since the toolbar buttons just change the panel that is visible.
  //   // to achieve that, we try to find if the path of the clicked element
  //   // contains such an element which has the className = menu-button.
  //   // since only the menu buttons in the toolbar have such a class, only when
  //   // the toolbar buttons and its children are clicked on, then the find
  //   // function will not return undefined. Otherwise it will if you click
  //   // anywhere outside the body.
  //   //! Make sure no other className in the program has the same classname, or
  //   // at least change it to something unique.
  //   if (
  //     event.path.find((item) => item.className === "menu-button") == undefined
  //   ) {
  //     closePanel();
  //   }
  // }
</script>

<!-- to close the panel on click outside -->
<!-- <svelte:body on:click={handleClickOutside} /> -->

<div class="toolbar">
  <button class="menu-button" on:click={() => selectPanel("dummy")}>
    <Icon path={mdiHome} />
  </button>
  <button class="menu-button" on:click={() => selectPanel("dummy2")}>
    <Icon path={mdiAlert} />
  </button>
  <button class="menu-button" on:click={() => selectPanel("dummy3")}>
    <Icon path={mdiPen} />
  </button>
</div>

<!-- render a panel depending on what menu button is clicked dynamically -->
<svelte:component this={selectedPanel?.component} />
