<script lang="ts">
	let { label = 'Loading' }: { label?: string } = $props();
</script>

<div class="wrap" role="status">
	<span class="spinner" aria-hidden="true"></span>
	<span class="visually-hidden">{label}</span>
</div>

<style>
	.wrap {
		display: grid;
		place-items: center;
		padding: 32px;
	}
	.spinner {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		border: 3px solid var(--outline-variant);
		border-top-color: var(--primary);
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
