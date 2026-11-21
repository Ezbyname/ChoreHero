import type { NavigatorScreenParams } from '@react-navigation/native';
import type { AttentionKind } from '@/features/adultHome/adultHomeModel';

// Slice 4: role-based shells. Route names equal the locked tab labels (see
// src/navigation/roleShell.ts).
export type ChildTabParamList = {
  Home:     undefined;
  Missions: undefined;
  Rewards:  undefined;
  Me:       undefined;
};

export type AdultTabParamList = {
  Home:    undefined;
  Tasks:   undefined;
  Rewards: undefined;
  Family:  undefined;
};

// The root stack above the tabs. Settings exists only in the adult shell,
// where it is reached from the Home avatar or Family → Settings. The child
// shell's settings live in its Me tab.
export type RootStackParamList = {
  Tabs:     NavigatorScreenParams<ChildTabParamList> | NavigatorScreenParams<AdultTabParamList> | undefined;
  Settings: undefined;
  // Slice 5C: child shell only. The detail reads the task from the store by
  // this id; no task snapshot travels in the route.
  MissionDetails: { taskId: string };
  // Slice 6A: adult shell only. An Adult Home "Review" row opens the
  // existing review flow for this one item, found by kind and id.
  AdultReview: { kind: AttentionKind; id: string };
  // Slice 6B: adult shell only. The existing Create mission form, opened
  // from Adult Tasks "New" and Adult Home "New mission".
  NewMission: undefined;
  // Slice 6C: adult shell only. Create Reward (Board 11), opened from
  // Adult Rewards "New reward" and Adult Home "New reward".
  NewReward: undefined;
};

export type AuthStackParamList = {
  AuthWelcome:    undefined;
  Login:          undefined;
  Signup:         undefined;
  ForgotPassword: undefined;
};
