/*
 * Copyright (C) 2016  Alex Yatskov <alex@foosoft.net>
 * Author: Alex Yatskov <alex@foosoft.net>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

class AnkiWeb {
    constructor(username, password) {
        this.username = username;
        this.password = password;
        this.noteInfo = null;
        this.logged = false;
    }

    addNote(note) {
        return Promise.resolve(true);
    }

    canAddNotes(notes) {
        return Promise.resolve([]);
    }

    getDeckNames() {
        return this.retrieve().then(info => info.deckNames);
    }

    getModelNames() {
        return this.retrieve().then(info => info.models.map(m => m.name));
    }

    getModelFieldNames(modelName) {
        return this.retrieve().then(info => {
            const model = info.models.find(m => m.name === modelName);
            return model ? model.fields : [];
        });
    }

    retrieve() {
        if (this.noteInfo !== null) {
            return Promise.resolve(this.noteInfo);
        }

        return this.authenticate().then(() => {
            return AnkiWeb.scrape();
        }).then(({deckNames, models}) => {
            this.noteInfo = {deckNames, models};
            return this.noteInfo;
        });
    }

    authenticate() {
        if (this.logged) {
            return Promise.resolve(true);
        }

        return AnkiWeb.logout().then(() => {
            return AnkiWeb.login(this.username, this.password);
        }).then(() => {
            this.logged = true;
            return true;
        });
    }

    getStatus() {
        return 'ready';
    }

    static scrape() {
        return new Promise((resolve, reject) => {
            $.get('https://ankiweb.net/edit/', (data, status) => {
                if (status !== 'success') {
                    reject('failed to execute scrape request');
                    return;
                }

                const modelsJson = JSON.parse(/editor\.models = (.*}]);/.exec(data)[1]);
                if (!modelsJson) {
                    reject('failed to scrape model data');
                    return;
                }

                const decksJson = JSON.parse(/editor\.decks = (.*}});/.exec(data)[1]);
                if (!decksJson) {
                    reject('failed to scrape deck data');
                    return;
                }

                const deckNames = Object.keys(decksJson).map(d => decksJson[d].name);
                const models = [];
                for (const modelJson of modelsJson) {
                    models.push({
                        name: modelJson.name,
                        id: modelJson.id,
                        fields: modelJson.flds.map(f => f.name)
                    });
                }

                resolve({deckNames, models});
            });
        });
    }

    static login(username, password) {
        return new Promise((resolve, reject) => {
            $.post('https://ankiweb.net/account/login', {username, password, submitted: 1}, (data, status) => {
                if (status !== 'success') {
                    if (data.includes('class="mitem"')) {
                        resolve();
                    } else {
                        reject('failed to authenticate');
                    }
                } else {
                    reject('failed to execute login request');
                }
            });
        });
    }

    static logout() {
        return new Promise((resolve, reject) => {
            $.get('https://ankiweb.net/account/logout', (data, status) => {
                if (status === 'success') {
                    resolve();
                } else {
                    reject('failed to execute logout request');
                }
            });
        });
    }
}
