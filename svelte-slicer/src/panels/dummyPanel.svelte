<script>
  import GenericPanel from "./genericPanel.svelte";

  const inputs = [
    [
      {
        name: "X",
        type: "range",
        min: -10,
        max: 10,
        value: 0,
      },
      {
        name: "Enable Y",
        type: "checkbox-toggle",
      },
      {
        name: "Y",
        type: "toggle-text",
        bind: "Enable Y",
      },
      {
        name: "Go to Z",
        type: "submenu",
        index: 1,
      },
    ],
    [
      {
        name: "Z",
        type: "range",
        min: -5,
        max: 5,
        value: 0,
      },
    ],
  ];
</script>

<GenericPanel panelTitle="Panel 1" {inputs} />
