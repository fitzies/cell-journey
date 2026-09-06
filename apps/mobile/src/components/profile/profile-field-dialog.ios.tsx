import { Alert, Button, Host, Text, TextField, useNativeState } from '@expo/ui/swift-ui';
import { autocorrectionDisabled, disabled, keyboardType, textContentType, textInputAutocapitalization } from '@expo/ui/swift-ui/modifiers';
import { useEffect, useRef, useState } from 'react';
import { Alert as SystemAlert } from 'react-native';
import { type ProfileFieldDialogProps, useProfileFieldDraft } from './profile-field-model';

// The system owns this alert's text fields, keyboard, buttons and presentation.
export function ProfileFieldDialog(props: ProfileFieldDialogProps) {
  const draft = useProfileFieldDraft(props);
  const [presented, setPresented] = useState(true);
  const firstName = useNativeState(props.initial.firstName);
  const lastName = useNativeState(props.initial.lastName);
  const postalSector = useNativeState('');
  const submitted = useRef(false);
  const reportedError = useRef<string | null>(null);

  // Apple dismisses alert actions immediately. Retain the draft during the write
  // and offer a retry after dismissal if saving fails.
  useEffect(() => {
    if (!draft.error || presented || reportedError.current === draft.error) return;
    reportedError.current = draft.error;
    SystemAlert.alert('Could not save profile', draft.error, [
      { text: 'Cancel', style: 'cancel', onPress: props.onClose },
      { text: 'Try again', onPress: () => { submitted.current = false; setPresented(true); } },
    ]);
  }, [draft.error, presented, props.onClose]);

  return <Host style={{ width: 1, height: 1 }} ignoreSafeArea="all">
    <Alert title={props.field === 'name' ? 'Edit name' : 'Postal district'} isPresented={presented}
      onIsPresentedChange={value => {
        setPresented(value);
        if (!value && !submitted.current) draft.close();
      }}>
      <Alert.Trigger><Text>{''}</Text></Alert.Trigger>
      <Alert.Actions>
        {props.field === 'name' ? <>
          <TextField text={firstName} placeholder="First name" autoFocus
            onTextChange={value => draft.setValue('firstName', value)}
            modifiers={[textContentType('givenName'), textInputAutocapitalization('words'), autocorrectionDisabled()]} />
          <TextField text={lastName} placeholder="Last name"
            onTextChange={value => draft.setValue('lastName', value)}
            modifiers={[textContentType('familyName'), textInputAutocapitalization('words'), autocorrectionDisabled()]} />
        </> : <TextField text={postalSector} placeholder="First two postal digits" maxLength={2} autoFocus
          onTextChange={value => draft.setValue('postalSector', value)} modifiers={[keyboardType('numeric')]} />}
        <Button label="Cancel" role="cancel" onPress={draft.close} />
        <Button label="Save" modifiers={[disabled(!draft.canSave)]} onPress={() => {
          submitted.current = true;
          reportedError.current = null;
          void draft.submit();
        }} />
      </Alert.Actions>
      <Alert.Message><Text>{props.field === 'postal' ? draft.postalHint : 'Enter your first and last names.'}</Text></Alert.Message>
    </Alert>
  </Host>;
}
