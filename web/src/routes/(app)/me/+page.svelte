<script lang="ts">
	import { session } from '#lib/session.svelte.js';
	import ProfileView from '../ProfileView.svelte';
</script>

{#if session.userId}
	<ProfileView userId={session.userId} />
{/if}
