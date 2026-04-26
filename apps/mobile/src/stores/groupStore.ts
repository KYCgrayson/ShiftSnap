import { create } from 'zustand';
import { supabase } from '../services/supabase';
import { getIsGuest } from './authStore';

interface GroupItem {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
  settings: Record<string, unknown>;
  created_at: string;
}

interface GroupMemberItem {
  id: string;
  group_id: string;
  user_id: string;
  role: 'member' | 'site_manager' | 'admin';
  nickname: string | null;
  color: string | null;
  is_visible: boolean;
  joined_at: string;
  display_name?: string;
}

interface GroupState {
  groups: GroupItem[];
  currentGroup: GroupItem | null;
  members: GroupMemberItem[];
  loading: boolean;
  error: string | null;

  fetchGroups: (userId: string) => Promise<void>;
  fetchOrCreateDefaultGroup: (userId: string) => Promise<void>;
  switchGroup: (groupId: string) => void;
  fetchMembers: (groupId: string) => Promise<void>;
  joinGroupByInvite: (userId: string, inviteCode: string) => Promise<void>;
  leaveGroup: (userId: string, groupId: string) => Promise<void>;
  updateGroupName: (groupId: string, name: string) => Promise<void>;
  reset: () => void;
}

export const useGroupStore = create<GroupState>((set, get) => ({
  groups: [],
  currentGroup: null,
  members: [],
  loading: false,
  error: null,

  fetchGroups: async (userId: string) => {
    if (getIsGuest()) {
      set({
        groups: [{
          id: 'guest-group',
          name: 'Guest Team',
          invite_code: 'GUEST',
          created_by: 'guest-user',
          settings: {},
          created_at: new Date().toISOString(),
        }],
        currentGroup: {
          id: 'guest-group',
          name: 'Guest Team',
          invite_code: 'GUEST',
          created_by: 'guest-user',
          settings: {},
          created_at: new Date().toISOString(),
        },
        loading: false,
      });
      return;
    }
    set({ loading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('group_members')
        .select('group_id, groups(*)')
        .eq('user_id', userId);

      if (error) throw error;

      const groups: GroupItem[] = (data || [])
        .map((gm: any) => gm.groups)
        .filter(Boolean);

      const currentGroup = get().currentGroup;
      set({
        groups,
        currentGroup: currentGroup && groups.find((g) => g.id === currentGroup.id)
          ? currentGroup
          : groups[0] || null,
        loading: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch groups';
      set({ loading: false, error: message });
    }
  },

  fetchOrCreateDefaultGroup: async (userId: string) => {
    if (getIsGuest()) {
      await get().fetchGroups(userId);
      return;
    }
    set({ loading: true, error: null });
    try {
      // Try to fetch existing groups first
      const { data: memberData, error: memberError } = await supabase
        .from('group_members')
        .select('group_id, groups(*)')
        .eq('user_id', userId);

      if (memberError) throw memberError;

      const groups: GroupItem[] = (memberData || [])
        .map((gm: any) => gm.groups)
        .filter(Boolean);

      if (groups.length > 0) {
        set({
          groups,
          currentGroup: groups[0],
          loading: false,
        });
        return;
      }

      // No groups — create a default one
      const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const { data: groupData, error: groupError } = await supabase
        .from('groups')
        .insert({
          name: 'My Team',
          invite_code: inviteCode,
          created_by: userId,
        })
        .select()
        .single();

      if (groupError) throw groupError;

      // Add self as admin
      await supabase
        .from('group_members')
        .insert({
          group_id: groupData.id,
          user_id: userId,
          role: 'admin',
        });

      set({
        groups: [groupData],
        currentGroup: groupData,
        loading: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create default group';
      set({ loading: false, error: message });
    }
  },

  switchGroup: (groupId: string) => {
    const group = get().groups.find((g) => g.id === groupId) || null;
    set({ currentGroup: group });
  },

  fetchMembers: async (groupId: string) => {
    if (getIsGuest()) {
      set({ members: [] });
      return;
    }
    try {
      const { data, error } = await supabase
        .from('group_members')
        .select('*, users(display_name, email)')
        .eq('group_id', groupId);

      if (error) throw error;
      const members: GroupMemberItem[] = (data || []).map((m: any) => ({
        ...m,
        display_name: m.users?.display_name || m.users?.email?.split('@')[0] || undefined,
        users: undefined,
      }));
      set({ members });
    } catch (error) {
      console.error('Error fetching group members:', error);
    }
  },

  joinGroupByInvite: async (userId: string, inviteCode: string) => {
    if (getIsGuest()) return;
    set({ loading: true, error: null });
    try {
      // RPC bypasses the groups_select RLS policy, which only lets
      // members read their groups, so a fresh user with just the invite
      // code can still find and join the group atomically server-side.
      const { data: gid, error: rpcError } = await supabase.rpc(
        'join_group_by_invite_code',
        { code: inviteCode.toUpperCase() }
      );

      if (rpcError) {
        // Surface the structured errors the RPC raises.
        if (rpcError.message.includes('ALREADY_MEMBER')) {
          throw new Error('ALREADY_MEMBER');
        }
        throw rpcError;
      }
      if (!gid) throw new Error('INVALID_CODE');

      // Refresh groups and switch to the new one
      await get().fetchGroups(userId);
      get().switchGroup(gid as string);
      set({ loading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to join group';
      set({ loading: false, error: message });
      throw error;
    }
  },

  leaveGroup: async (userId: string, groupId: string) => {
    if (getIsGuest()) return;
    set({ loading: true, error: null });
    try {
      const { error } = await supabase
        .from('group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', userId);

      if (error) throw error;

      // Refresh groups
      await get().fetchGroups(userId);

      // If the deleted group was the current one, switch
      if (get().currentGroup?.id === groupId) {
        const remaining = get().groups;
        set({ currentGroup: remaining[0] || null });
      }
      set({ loading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to leave group';
      set({ loading: false, error: message });
      throw error;
    }
  },

  updateGroupName: async (groupId: string, name: string) => {
    if (getIsGuest()) return;
    try {
      const { error } = await supabase
        .from('groups')
        .update({ name })
        .eq('id', groupId);

      if (error) throw error;

      // Update local state
      set((state) => ({
        groups: state.groups.map((g) => g.id === groupId ? { ...g, name } : g),
        currentGroup: state.currentGroup?.id === groupId
          ? { ...state.currentGroup, name }
          : state.currentGroup,
      }));
    } catch (error) {
      console.error('Error updating group name:', error);
      throw error;
    }
  },

  reset: () => {
    set({ groups: [], currentGroup: null, members: [], loading: false, error: null });
  },
}));
