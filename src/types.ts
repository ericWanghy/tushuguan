export interface User {
  id: string;
  username: string;
  role: 'admin' | 'user';
}

export interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  user_id: string;
}

export interface Document {
  id: string;
  title: string;
  content: string;
  folder_id: string | null;
  user_id: string;
  source_type: 'md' | 'feishu';
  original_link?: string;
  share_token?: string;
  created_at: string;
  updated_at: string;
  last_opened_at: string;
}

export interface SharedDocument {
  title: string;
  content: string;
  source_type: 'md' | 'feishu';
  original_link?: string;
  created_at: string;
  author: string;
}
