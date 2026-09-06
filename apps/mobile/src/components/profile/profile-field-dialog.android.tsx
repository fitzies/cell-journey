import { AlertDialog, Checkbox, Column, Host, Row, Text, TextButton, TextField, useNativeState, type TextFieldRef } from '@expo/ui/jetpack-compose';
import { defaultMinSize, fillMaxWidth, height, padding, toggleable, verticalScroll } from '@expo/ui/jetpack-compose/modifiers';
import { useRef } from 'react';
import { useWindowDimensions } from 'react-native';
import { useProfileFieldDraft, type ProfileFieldDialogProps } from './profile-field-model';

export function ProfileFieldDialog(props: ProfileFieldDialogProps) {
  const { field, initial, services } = props;
  const draft = useProfileFieldDraft(props);
  const firstName = useNativeState(initial.firstName);
  const lastName = useNativeState(initial.lastName);
  const postalSector = useNativeState(initial.postalSector);
  const lastNameRef = useRef<TextFieldRef>(null);
  const { height: screenHeight } = useWindowDimensions();
  const title = field === 'name' ? 'Name' : field === 'services' ? 'Services' : 'Postal district';

  return (
    <Host matchContents>
      <AlertDialog
        onDismissRequest={draft.close}
        properties={{ dismissOnBackPress: !draft.saving, dismissOnClickOutside: !draft.saving }}
      >
        <AlertDialog.Title><Text>{title}</Text></AlertDialog.Title>
        <AlertDialog.Text>
          <Column verticalArrangement={{ spacedBy: 12 }} modifiers={[fillMaxWidth()]}>
            {field === 'name' ? <>
              <TextField
                value={firstName}
                onValueChange={(value) => draft.setValue('firstName', value)}
                autoFocus
                singleLine
                enabled={!draft.saving}
                keyboardOptions={{ capitalization: 'words', autoCorrectEnabled: false, imeAction: 'next' }}
                keyboardActions={{ onNext: () => { void lastNameRef.current?.focus(); } }}
                modifiers={[fillMaxWidth()]}
              ><TextField.Label><Text>First name</Text></TextField.Label></TextField>
              <TextField
                ref={lastNameRef}
                value={lastName}
                onValueChange={(value) => draft.setValue('lastName', value)}
                singleLine
                enabled={!draft.saving}
                keyboardOptions={{ capitalization: 'words', autoCorrectEnabled: false, imeAction: 'done' }}
                keyboardActions={{ onDone: () => { void draft.submit(); } }}
                modifiers={[fillMaxWidth()]}
              ><TextField.Label><Text>Last name</Text></TextField.Label></TextField>
            </> : null}
            {field === 'postal' ? <>
              <TextField
                value={postalSector}
                onValueChange={(value) => draft.setValue('postalSector', value)}
                autoFocus
                singleLine
                maxLength={2}
                enabled={!draft.saving}
                keyboardOptions={{ keyboardType: 'number', imeAction: 'done' }}
                keyboardActions={{ onDone: () => { void draft.submit(); } }}
                modifiers={[fillMaxWidth()]}
              ><TextField.Label><Text>First two postal digits</Text></TextField.Label></TextField>
              <Text>{draft.postalHint}</Text>
            </> : null}
            {field === 'services' ? <>
              <Text>Choose the services you attend.</Text>
              <Column modifiers={[fillMaxWidth(), height(Math.min(Math.max(services.length * 56, 56), screenHeight * 0.4)), verticalScroll()]}>
                {services.map((service) => {
                  const selected = draft.values.serviceIds.includes(service._id);
                  return <Row
                    key={service._id}
                    verticalAlignment="center"
                    horizontalArrangement={{ spacedBy: 12 }}
                    modifiers={[
                      fillMaxWidth(),
                      defaultMinSize({ minHeight: 56 }),
                      ...(!draft.saving ? [toggleable(selected, () => draft.toggleService(service._id), { role: 'checkbox' })] : []),
                      padding(0, 8, 0, 8),
                    ]}
                  >
                    <Checkbox value={selected} enabled={!draft.saving} />
                    <Text>{service.name}</Text>
                  </Row>;
                })}
              </Column>
              {draft.values.serviceIds.length === 0 ? <Text>Choose at least one service.</Text> : null}
            </> : null}
            {draft.error ? <Text>{draft.error}</Text> : null}
          </Column>
        </AlertDialog.Text>
        <AlertDialog.DismissButton>
          <TextButton enabled={!draft.saving} onClick={draft.close}><Text>Cancel</Text></TextButton>
        </AlertDialog.DismissButton>
        <AlertDialog.ConfirmButton>
          <TextButton enabled={draft.canSave} onClick={() => { void draft.submit(); }}>
            <Text>{draft.saving ? 'Saving…' : 'Save'}</Text>
          </TextButton>
        </AlertDialog.ConfirmButton>
      </AlertDialog>
    </Host>
  );
}
