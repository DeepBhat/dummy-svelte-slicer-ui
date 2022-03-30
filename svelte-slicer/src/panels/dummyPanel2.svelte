<script>
  import { Card, CardText, CardActions, Button } from "svelte-materialify";

  function changeTheme() {
    themeStore.update((theme) => (theme === "light" ? "dark" : "light"));
  }
</script>

<div class="panel">
  <Card outlined style="max-width:300px;">
    <div class="pl-4 pr-4 pt-3">
      <span class="text-overline"> DUMMY PANEL 2 </span>
      <br />
      <span class="text-h5 mb-2"> Clicked alert </span>
      <br />
    </div>
    <CardText>
      Lorem ipsum dolor sit amet consectetur adipisicing elit. Reprehenderit,
      qui quaerat rerum incidunt nisi ducimus?
    </CardText>
    <CardActions>
      <Button rounded outlined on:click={changeTheme}>Switch theme</Button>
    </CardActions>
  </Card>
</div>
