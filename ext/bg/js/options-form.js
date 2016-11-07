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


function yomichan() {
    return chrome.extension.getBackgroundPage().yomichan;
}

function anki() {
    return yomichan().anki;
}

function fieldsToDict(selection) {
    const result = {};
    selection.each((index, element) => {
        result[$(element).data('field')] = $(element).val();
    });

    return result;
}

function modelIdToFieldOptKey(id) {
    return {
        'anki-term-model': 'ankiTermFields',
        'anki-kanji-model': 'ankiKanjiFields'
    }[id];
}

function modelIdToMarkers(id) {
    return {
        'anki-term-model': [
            'audio',
            'expression',
            'expression-furigana',
            'glossary',
            'glossary-list',
            'reading',
            'sentence',
            'tags',
            'url'
        ],
        'anki-kanji-model': [
            'character',
            'glossary',
            'glossary-list',
            'kunyomi',
            'onyomi',
            'url'
        ],
    }[id];
}

function getFormValues() {
    return loadOptions().then(optsOld => {
        const optsNew = $.extend({}, optsOld);

        optsNew.activateOnStartup = $('#activate-on-startup').prop('checked');
        optsNew.enableAudioPlayback = $('#enable-audio-playback').prop('checked');
        optsNew.showAdvancedOptions = $('#show-advanced-options').prop('checked');
        optsNew.enableSoftKatakanaSearch = $('#enable-soft-katakana-search').prop('checked');

        optsNew.holdShiftToScan = $('#hold-shift-to-scan').prop('checked');
        optsNew.selectMatchedText = $('#select-matched-text').prop('checked');
        optsNew.scanDelay = parseInt($('#scan-delay').val(), 10);
        optsNew.scanLength = parseInt($('#scan-length').val(), 10);

        optsNew.ankiMethod = $('#anki-method').val();
        optsNew.ankiUsername = $('#anki-username').val();
        optsNew.ankiPassword = $('#anki-password').val();
        optsNew.ankiCardTags = $('#anki-card-tags').val().split(/[,; ]+/);
        optsNew.sentenceExtent = parseInt($('#sentence-extent').val(), 10);
        optsNew.ankiTermDeck = $('#anki-term-deck').val();
        optsNew.ankiTermModel = $('#anki-term-model').val();
        optsNew.ankiTermFields = fieldsToDict($('#term .anki-field-value'));
        optsNew.ankiKanjiDeck = $('#anki-kanji-deck').val();
        optsNew.ankiKanjiModel = $('#anki-kanji-model').val();
        optsNew.ankiKanjiFields = fieldsToDict($('#kanji .anki-field-value'));

        $('.dict').each((index, element) => {
            const dictionary = $(element);
            const title = dictionary.data('title');
            const enableTerms = dictionary.find('.dict-enable-terms').prop('checked');
            const enableKanji = dictionary.find('.dict-enable-kanji').prop('checked');
            optsNew.dictionaries[title] = {enableTerms, enableKanji};
        });

        return {
            optsNew: sanitizeOptions(optsNew),
            optsOld: sanitizeOptions(optsOld)
        };
    });
}

function updateVisibility(opts) {
    switch (opts.ankiMethod) {
        case 'ankiweb':
            $('#anki-general').show();
            $('.anki-login').show();
            break;
        case 'ankiconnect':
            $('#anki-general').show();
            $('.anki-login').hide();
            break;
        default:
            $('#anki-general').hide();
            break;
    }

    if (opts.showAdvancedOptions) {
        $('.options-advanced').show();
    } else {
        $('.options-advanced').hide();
    }
}

function populateAnkiDeckAndModel(opts) {
    const ankiSpinner = $('#anki-spinner');
    ankiSpinner.show();

    const ankiFormat = $('#anki-format');
    ankiFormat.hide();

    const ankiDeck = $('.anki-deck');
    ankiDeck.find('option').remove();

    const ankiModel = $('.anki-model');
    ankiModel.find('option').remove();

    return anki().getDeckNames().then(names => {
        names.forEach(name => ankiDeck.append($('<option/>', {value: name, text: name})));
        $('#anki-term-deck').val(opts.ankiTermDeck);
        $('#anki-kanji-deck').val(opts.ankiKanjiDeck);
    }).then(() => {
        return anki().getModelNames();
    }).then(names => {
        names.forEach(name => ankiModel.append($('<option/>', {value: name, text: name})));
        return populateAnkiFields($('#anki-term-model').val(opts.ankiTermModel), opts);
    }).then(() => {
        return populateAnkiFields($('#anki-kanji-model').val(opts.ankiKanjiModel), opts);
    }).then(() => {
        $('#anki-error').hide();
        ankiFormat.show();
    }).catch(error => {
        $('#anki-error').show().find('span').text(error);
    }).then(() => {
        ankiSpinner.hide();
    });
}

function populateDictionaries(opts) {
    const container = $('.dicts');
    container.empty();

    const dictError = $('#dict-error');
    dictError.hide();

    yomichan().translator.database.getDictionaries().then(rows => {
        rows.forEach(row => {
            const dictOpts = opts.dictionaries[row.title] || {enableTerms: true, enableKanji: false};
            const html = Handlebars.templates['dictionary.html']({
                title: row.title,
                version: row.version,
                hasTerms: row.hasTerms,
                hasKanji: row.hasKanji,
                enableTerms: dictOpts.enableTerms,
                enableKanji: dictOpts.enableKanji
            });

            container.append($(html));
        });

        $('.dict-delete').click(e => {
            const button = $(e.target);
            const dict = button.closest('.dict');
            const title = dict.data('title');

            button.prop('disabled', true);
            yomichan().translator.database.deleteDictionary(title).then(() => {
                dict.slideUp();
            }).catch(error => {
                dictError.show().find('span').text(error);
            }).then(() => {
                button.prop('disabled', false);
            });
        });

        container.find('.dict input').change(onOptionsChanged);
    }).catch(error => {
        dictError.show().find('span').text(error);
    });
}

function onImportDictionary() {
    const dictInputs = $('#dict-import').find('input');
    dictInputs.prop('disabled', true);

    const dictError = $('#dict-error');
    dictError.hide();

    const progressbar = $('#dict-import-progress');
    const progressValue = progressbar.find('div');
    progressbar.show();

    const callback = (total, current) => {
        $('.progress-bar').css('width', `${current / total * 100.0}%`);
    };

    const dictUrl = $('#dict-import-url').val();
    yomichan().translator.database.importDictionary(dictUrl, callback).catch(error => {
        dictError.show().find('span').text(error);
    }).then(() => {
        dictInputs.prop('disabled', false);
        progressbar.hide();
    });
}

function populateAnkiFields(element, opts) {
    const tab = element.closest('.tab-pane');
    const container = tab.find('tbody');
    container.empty();

    const modelName = element.val();
    if (modelName === null) {
        return Promise.resolve();
    }

    const modelId = element.attr('id');
    const optKey = modelIdToFieldOptKey(modelId);
    const markers = modelIdToMarkers(modelId);

    return anki().getModelFieldNames(modelName).then(names => {
        names.forEach(name => {
            const html = Handlebars.templates['model.html']({
                name,
                markers,
                value: opts[optKey][name] || ''
            });

            container.append($(html));
        });

        tab.find('.anki-field-value').change(onOptionsChanged);
        tab.find('.marker-link').click(e => {
            e.preventDefault();
            const link = e.target;
            $(link).closest('.input-group').find('.anki-field-value').val(`{${link.text}}`).trigger('change');
        });
    });
}

function onOptionsChanged(e) {
    if (!e.originalEvent && !e.isTrigger) {
        return;
    }

    getFormValues().then(({optsNew, optsOld}) => {
        saveOptions(optsNew).then(() => {
            yomichan().setOptions(optsNew);
            updateVisibility(optsNew);

            const loginChanged =
                optsNew.ankiUsername !== optsOld.ankiUsername ||
                optsNew.ankiPassword !== optsOld.ankiPassword;

            if (loginChanged && optsNew.ankiMethod === 'ankiweb') {
                anki().logout().then(() => populateAnkiDeckAndModel(optsNew)).catch(error => {
                    $('#anki-error').show().find('span').text(error);
                });
            } else if (loginChanged || optsNew.ankiMethod !== optsOld.ankiMethod) {
                populateAnkiDeckAndModel(optsNew);
            }
        });
    });
}

function onAnkiModelChanged(e) {
    if (!e.originalEvent) {
        return;
    }

    getFormValues().then(({optsNew, optsOld}) => {
        optsNew[modelIdToFieldOptKey($(this).id)] = {};

        const ankiSpinner = $('#anki-spinner');
        ankiSpinner.show();

        populateAnkiFields($(this), optsNew).then(() => {
            saveOptions(optsNew).then(() => yomichan().setOptions(optsNew));
        }).catch(error => {
            $('#anki-error').show().find('span').text(error);
        }).then(() => {
            $('#anki-error').hide();
            ankiSpinner.hide();
        });
    });
}

$(document).ready(() => {
    Handlebars.partials = Handlebars.templates;

    loadOptions().then(opts => {
        $('#activate-on-startup').prop('checked', opts.activateOnStartup);
        $('#enable-audio-playback').prop('checked', opts.enableAudioPlayback);
        $('#enable-soft-katakana-search').prop('checked', opts.enableSoftKatakanaSearch);
        $('#show-advanced-options').prop('checked', opts.showAdvancedOptions);

        $('#hold-shift-to-scan').prop('checked', opts.holdShiftToScan);
        $('#select-matched-text').prop('checked', opts.selectMatchedText);
        $('#scan-delay').val(opts.scanDelay);
        $('#scan-length').val(opts.scanLength);

        $('#anki-method').val(opts.ankiMethod);
        $('#anki-username').val(opts.ankiUsername);
        $('#anki-password').val(opts.ankiPassword);
        $('#anki-card-tags').val(opts.ankiCardTags.join(' '));
        $('#sentence-extent').val(opts.sentenceExtent);

        $('input, select').not('.anki-model').change(onOptionsChanged);
        $('.anki-model').change(onAnkiModelChanged);

        $('#dict-import a').click(e => {
            e.preventDefault();
            const control = $('#dict-import-url');
            const url = $(e.target).data('url');
            if (url.includes('/')) {
                control.val(url);
            } else {
                control.val(chrome.extension.getURL(`bg/data/${url}/index.json`));
            }
            control.trigger('input');
        });

        const dictImportUrl = $('#dict-import-url');
        dictImportUrl.on('input', () => {
            const disable = dictImportUrl.val().trim().length === 0;
            $('#dict-import-start').prop('disabled', disable);
        });

        $('#dict-import-start').click(onImportDictionary);

        populateDictionaries(opts);
        populateAnkiDeckAndModel(opts);
        updateVisibility(opts);
    });
});
