import { Redirect } from 'expo-router';
import { useAuthStore } from '../../src/stores/authStore';

// Deep links of the form shiftsnap://invite/<code> are handled by
// useInviteLinkHandler at the root, which intercepts the URL event,
// looks up the group, and navigates the user. This screen exists only
// so expo-router does not show its "Page could not be found" page
// behind the in-app alert: it just redirects to wherever the user
// belongs based on auth state.
export default function InviteCatchAll() {
  const user = useAuthStore((s) => s.user);
  return <Redirect href={user ? '/(tabs)/home' : '/(auth)/welcome'} />;
}
