import 'package:ellipse_companion/main.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';

void main() {
  testWidgets('bottom navigation switches destinations', (tester) async {
    await tester.pumpWidget(const EllipseDeskApp());

    expect(find.text('Home'), findsNWidgets(2));

    await tester.tap(find.byIcon(Iconsax.direct_inbox));
    await tester.pump(const Duration(milliseconds: 250));

    expect(find.text('Inbox'), findsNWidgets(2));
  });
}
