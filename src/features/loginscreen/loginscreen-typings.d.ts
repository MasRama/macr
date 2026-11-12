// @girs/gnome-shell 46.0.2 has no typings for gdm/loginDialog.js. These cover
// the parts of GNOME Shell 46's LoginDialog that the login screen module uses.
declare module 'resource:///org/gnome/shell/gdm/loginDialog.js' {
    import type AccountsService from 'gi://AccountsService';
    import type Clutter from 'gi://Clutter';
    import St from 'gi://St';

    /** One user in the list: a button holding a UserWidget. */
    export interface UserListItem extends St.Button {
        user: AccountsService.User;
        _userWidget: St.BoxLayout;
    }

    /** The scrollable list of users, emits "item-added" (item). */
    export interface UserList extends St.ScrollView {
        _box: St.BoxLayout;
        _items: Record<string, UserListItem>;
    }

    export class LoginDialog extends St.Widget {
        _userSelectionBox: St.BoxLayout;
        _userList: UserList;
        _authPrompt: St.Widget;
        _bannerView: St.ScrollView;
        _logoBin: St.Widget;
        _notListedButton: St.Button;
        _init(parentActor: Clutter.Actor): void;
        _getCenterActorAllocation(dialogBox: Clutter.ActorBox, actor: Clutter.Actor): Clutter.ActorBox;
    }
}
