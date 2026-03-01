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
        .select('*')
        .eq('group_id', groupId);

      if (error) throw error;
      set({ members: data || [] });
    } catch (error) {
      console.error('Error fetching group members:', error);
    }
  },

  reset: () => {
    set({ groups: [], currentGroup: null, members: [], loading: false, error: null });
  },
}));
