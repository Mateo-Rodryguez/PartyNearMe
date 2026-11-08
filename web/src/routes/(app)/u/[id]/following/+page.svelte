<script lang="ts">
	import { page } from '$app/state';
	import PeopleList from '../../../PeopleList.svelte';
</script>

{#key page.params.id}
	<PeopleList userId={page.params.id ?? ''} kind="following" />
{/key}
