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
        name: "Y",
        type: "range",
        min: -10,
        max: 10,
        value: 10,
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
