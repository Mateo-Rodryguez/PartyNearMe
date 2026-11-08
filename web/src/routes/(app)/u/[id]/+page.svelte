<script lang="ts">
	import { page } from '$app/state';
	import ProfileView from '../../ProfileView.svelte';
</script>

{#key page.params.id}
	<ProfileView userId={page.params.id ?? ''} />
{/key}
